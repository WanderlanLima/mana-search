package com.manasearch.app.scanner.camera

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PointF
import android.view.View

class OverlayView(context: android.content.Context, attrs: android.util.AttributeSet?) : View(context, attrs) {

    private val paint = Paint().apply {
        color = Color.parseColor("#d095ff") // Mana Search Theme Purple
        style = Paint.Style.STROKE
        strokeWidth = 8f
        isAntiAlias = true
    }

    private var targetPoints = mutableListOf<PointF>()
    private var currentPoints = mutableListOf<PointF>()

    fun setCardContour(newPoints: List<org.opencv.core.Point>, imgW: Int, imgH: Int) {
        if (imgW <= 0 || imgH <= 0 || newPoints.size != 4) return
        
        // Calculate Translation Matrix
        val viewRatio = width.toFloat() / height.toFloat()
        val imageRatio = imgW.toFloat() / imgH.toFloat()
        
        var scaleX = 1f; var scaleY = 1f; var offsetX = 0f; var offsetY = 0f
        
        if (imageRatio > viewRatio) {
            scaleY = height.toFloat() / imgH.toFloat()
            scaleX = scaleY 
            val scaledImageWidth = imgW * scaleX
            offsetX = (width - scaledImageWidth) / 2f
        } else {
            scaleX = width.toFloat() / imgW.toFloat()
            scaleY = scaleX
            val scaledImageHeight = imgH * scaleY
            offsetY = (height - scaledImageHeight) / 2f
        }

        // Project onto physical screen plane
        val mapped = newPoints.map { PointF((it.x * scaleX + offsetX).toFloat(), (it.y * scaleY + offsetY).toFloat()) }
        
        targetPoints.clear()
        targetPoints.addAll(mapped)
        
        if (currentPoints.isEmpty()) currentPoints.addAll(mapped)
        invalidate()
    }
    
    fun clearContour() {
        targetPoints.clear()
        currentPoints.clear()
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        
        if (currentPoints.size == 4 && targetPoints.size == 4) {
            var isAnimating = false
            
            // Linear Interpolation (LERP): Move 35% of the distance each frame for butter-smooth visual anchoring
            for (i in 0..3) {
                val dx = targetPoints[i].x - currentPoints[i].x
                val dy = targetPoints[i].y - currentPoints[i].y
                
                if (Math.abs(dx) > 1f || Math.abs(dy) > 1f) {
                    isAnimating = true
                    currentPoints[i] = PointF(currentPoints[i].x + dx * 0.35f, currentPoints[i].y + dy * 0.35f)
                }
            }

            val path = Path()
            path.moveTo(currentPoints[0].x, currentPoints[0].y)
            for (i in 1..3) {
                path.lineTo(currentPoints[i].x, currentPoints[i].y)
            }
            path.close()
            canvas.drawPath(path, paint)
            
            if (isAnimating) invalidate()
        }
    }
}
