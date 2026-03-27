package com.manasearch.app.scanner.viewmodel

import android.app.Application
import android.graphics.Bitmap
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.manasearch.app.scanner.api.RetrofitClient
import com.manasearch.app.scanner.api.ScryfallCard
import com.manasearch.app.scanner.cv.CardDetector
import com.manasearch.app.scanner.data.DatabaseHelper
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

sealed class ScannerState {
    object Idle : ScannerState()
    object Processing : ScannerState()
    data class Success(val card: ScryfallCard, val confidence: Double, val artwork: Bitmap? = null) : ScannerState()
    data class Error(val message: String) : ScannerState()
}

class ScannerViewModel(application: Application) : AndroidViewModel(application) {

    private val _state = MutableStateFlow<ScannerState>(ScannerState.Idle)
    val state: StateFlow<ScannerState> = _state

    private var apiKey: String = ""
    private val dbHelper = DatabaseHelper(application.applicationContext) 

    fun setApiKey(key: String) {
        this.apiKey = key
    }

    fun processDetectionWithVision(artworkBitmap: Bitmap, nameBitmap: Bitmap) {
        if (_state.value is ScannerState.Processing) return

        viewModelScope.launch {
            _state.value = ScannerState.Processing

            try {
                // Primary Tier: Instant Local SQLite pHash Matching
                val computedHash = CardDetector.generatePHash(artworkBitmap)
                val match = dbHelper.findBestMatchId(computedHash)

                if (match != null) {
                    val finalCardId = match.first.trim()
                    val matchConfidence = 100.0 - (match.second * 1.5)
                    val card = RetrofitClient.api.getCardById(finalCardId)
                    _state.value = ScannerState.Success(card, matchConfidence, artworkBitmap)
                    resetWithDelay()
                    return@launch
                }
                
                // Fallback Tier: Local DB Miss (Database Incomplete). Execute MLKit OCR on the Name band.
                val image = InputImage.fromBitmap(nameBitmap, 0)
                val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
                
                recognizer.process(image)
                    .addOnSuccessListener { visionText ->
                        val rawText = visionText.text.replace("\n", " ").trim()
                        // Strip erratic characters from bad glare to help Scryfall fuzzy query
                        val cleanedText = rawText.replace(Regex("[^a-zA-Z0-9 ',\\-]"), "")
                        
                        if (cleanedText.length > 3) {
                            viewModelScope.launch {
                                try {
                                    val card = RetrofitClient.api.getCardFuzzy(cleanedText)
                                    _state.value = ScannerState.Success(card, 50.0, artworkBitmap) // 50% flat conf for OCR
                                } catch (e: Exception) {
                                    _state.value = ScannerState.Error("OCR Cloud Miss: $cleanedText")
                                }
                                resetWithDelay()
                            }
                        } else {
                            _state.value = ScannerState.Error("Não foi possível ler o nome da carta.")
                            resetWithDelay()
                        }
                    }
                    .addOnFailureListener { e ->
                        _state.value = ScannerState.Error("MLKit Falhou: ${e.message}")
                        resetWithDelay()
                    }

            } catch (e: Exception) {
                _state.value = ScannerState.Error("Falha Crítica: [${e.message}]")
                resetWithDelay()
            }
        }
    }
    
    private fun resetWithDelay() {
        viewModelScope.launch {
            kotlinx.coroutines.delay(2000L)
            _state.value = ScannerState.Idle
        }
    }
}
