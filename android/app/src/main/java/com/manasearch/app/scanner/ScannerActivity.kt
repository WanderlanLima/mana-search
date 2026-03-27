package com.manasearch.app.scanner

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.media.MediaPlayer
import android.os.Bundle
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.View
import android.widget.Button
import android.widget.ImageButton
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import com.manasearch.app.scanner.camera.FrameAnalyzer
import com.manasearch.app.scanner.viewmodel.ScannerState
import com.manasearch.app.scanner.viewmodel.ScannerViewModel
import kotlinx.coroutines.launch
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import com.google.android.material.bottomsheet.BottomSheetDialog

import org.opencv.android.OpenCVLoader

class ScannerActivity : AppCompatActivity() {

    private lateinit var cameraExecutor: ExecutorService
    private lateinit var viewModel: ScannerViewModel
    private var cameraControl: CameraControl? = null
    private var playSoundsEnabled = true

    @SuppressLint("ClickableViewAccessibility")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        OpenCVLoader.initDebug()
        setContentView(com.manasearch.app.R.layout.activity_scanner)

        viewModel = ViewModelProvider(this)[ScannerViewModel::class.java]
        val apiKey = intent.getStringExtra("apiKey") ?: ""
        viewModel.setApiKey(apiKey)

        cameraExecutor = Executors.newSingleThreadExecutor()

        findViewById<Button>(com.manasearch.app.R.id.btnClose).setOnClickListener {
            finish()
        }

        findViewById<ImageButton>(com.manasearch.app.R.id.btnSettings).setOnClickListener {
            showSettingsBottomSheet()
        }

        // Double-Tap to Focus Hook
        val viewFinder = findViewById<PreviewView>(com.manasearch.app.R.id.viewFinder)
        val gestureDetector = GestureDetector(this, object : GestureDetector.SimpleOnGestureListener() {
            override fun onDoubleTap(e: MotionEvent): Boolean {
                focusCameraRect(e.x, e.y, viewFinder)
                return true
            }
        })
        viewFinder.setOnTouchListener { _, event -> gestureDetector.onTouchEvent(event); true }

        if (allPermissionsGranted()) startCamera()
        else ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), 10)

        observeViewModel()
    }

    private fun showSettingsBottomSheet() {
        val bottomSheetDialog = BottomSheetDialog(this)
        val view = layoutInflater.inflate(com.manasearch.app.R.layout.bottom_sheet_settings, null)
        
        val cbSounds = view.findViewById<android.widget.CheckBox>(com.manasearch.app.R.id.cbPlaySounds)
        cbSounds.isChecked = playSoundsEnabled
        cbSounds.setOnCheckedChangeListener { _, isChecked -> playSoundsEnabled = isChecked }
        
        bottomSheetDialog.setContentView(view)
        bottomSheetDialog.show()
    }

    private fun focusCameraRect(x: Float, y: Float, viewFinder: PreviewView) {
        val factory = viewFinder.meteringPointFactory
        val point = factory.createPoint(x, y)
        val action = FocusMeteringAction.Builder(point).build()
        cameraControl?.startFocusAndMetering(action)
    }

    private fun startCamera() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)

        cameraProviderFuture.addListener({
            val cameraProvider: ProcessCameraProvider = cameraProviderFuture.get()
            val preview = Preview.Builder()
                .setTargetAspectRatio(AspectRatio.RATIO_16_9)
                .build().also {
                it.setSurfaceProvider(findViewById<PreviewView>(com.manasearch.app.R.id.viewFinder).surfaceProvider)
            }

            val imageAnalyzer = ImageAnalysis.Builder()
                .setTargetAspectRatio(AspectRatio.RATIO_16_9) 
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
                .build()
                .also {
                    val overlayView = findViewById<com.manasearch.app.scanner.camera.OverlayView>(com.manasearch.app.R.id.overlayView)
                    
                    it.setAnalyzer(cameraExecutor, FrameAnalyzer(
                        onContourDetected = { points, imgW, imgH ->
                            runOnUiThread { overlayView.setCardContour(points, imgW, imgH) }
                        },
                        onContourLost = {
                            runOnUiThread { overlayView.clearContour() }
                        },
                        onCardImageExtracted = { artworkBmp, nameBmp ->
                            viewModel.processDetectionWithVision(artworkBmp, nameBmp)
                        }
                    ))
                }

            try {
                cameraProvider.unbindAll()
                val camera = cameraProvider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, preview, imageAnalyzer)
                cameraControl = camera.cameraControl // Bind hardware to enable manual focus queries natively
            } catch (exc: Exception) { }

        }, ContextCompat.getMainExecutor(this))
    }

    private fun observeViewModel() {
        lifecycleScope.launch {
            viewModel.state.collect { state ->
                when (state) {
                    is ScannerState.Success -> {
                        val bubble = findViewById<android.widget.LinearLayout>(com.manasearch.app.R.id.cardResultBubble)
                        val ivArt = findViewById<android.widget.ImageView>(com.manasearch.app.R.id.ivCardArt)
                        val tvName = findViewById<android.widget.TextView>(com.manasearch.app.R.id.tvCardName)

                        // Prevent rapid-fire beep spam if holding camera over the exact same card
                        val currentText = tvName.text.toString()
                        if (currentText != state.card.name && playSoundsEnabled) playSuccessBeep()

                        bubble.visibility = View.VISIBLE
                        tvName.text = state.card.name
                        state.artwork?.let { ivArt.setImageBitmap(it) }

                        bubble.setOnClickListener {
                            val captureIntent = Intent()
                            captureIntent.putExtra("cardName", state.card.name)
                            setResult(RESULT_OK, captureIntent)
                            finish()
                        }
                    }
                    is ScannerState.Error -> {
                        // Suppressed text view outputs since we deploy via dynamic overlay
                    }
                    else -> {
                        // Keep bubble visibly anchored holding the cached card across noisy interpolations
                    }
                }
            }
        }
    }

    private fun playSuccessBeep() {
        try {
            // Optional system feedback to mirror native scanner triggers
            // MediaPlayer.create(this, android.R.raw.beep).start() 
        } catch(e: Exception) {}
    }

    private fun allPermissionsGranted() = ContextCompat.checkSelfPermission(
        baseContext, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 10) {
            if (allPermissionsGranted()) startCamera()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        cameraExecutor.shutdown()
    }
}
