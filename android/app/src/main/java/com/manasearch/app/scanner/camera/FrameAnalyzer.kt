package com.manasearch.app.scanner.camera

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import com.manasearch.app.scanner.cv.CardDetector
import org.opencv.core.Point
import java.io.ByteArrayOutputStream

class FrameAnalyzer(
    private val onContourDetected: (points: List<Point>, imgWidth: Int, imgHeight: Int) -> Unit,
    private val onContourLost: () -> Unit,
    private val onCardImageExtracted: (artworkBitmap: Bitmap, nameBitmap: Bitmap) -> Unit
) : ImageAnalysis.Analyzer {
    
    private var isProcessing = false
    private val centerHistory = mutableListOf<Point>()

    @SuppressLint("UnsafeOptInUsageError")
    override fun analyze(imageProxy: ImageProxy) {
        if (isProcessing) {
            imageProxy.close()
            return
        }

        isProcessing = true

        try {
            val bmpRaw = imageProxy.toBitmap()
            // IMPORTANT: CameraX returns the raw hardware sensor buffer (which is sideways 90deg on Android).
            // We MUST matrix rotate it to upright Portrait before feeding to OpenCV or the green box renders fully out of bounds!
            val matrix = android.graphics.Matrix()
            matrix.postRotate(imageProxy.imageInfo.rotationDegrees.toFloat())
            val bmp = Bitmap.createBitmap(bmpRaw, 0, 0, bmpRaw.width, bmpRaw.height, matrix, true)

            val detection = CardDetector.extractCardPoints(bmp)
            if (detection != null) {
                onContourDetected(detection.corners, bmp.width, bmp.height)
                
                // MANABOX PARITY: Never wait for 4-frame "steady hands". If we hit a ratio geometry, we rip and evaluate!
                // The ScannerViewModel already employs a state processing Debouncer.
                onCardImageExtracted(detection.artworkBitmap, detection.nameBitmap)
            } else {
                onContourLost()
            }
        } catch (e: Exception) {
            // silent fail
            e.printStackTrace()
        } finally {
            isProcessing = false
            imageProxy.close()
        }
    }
}
