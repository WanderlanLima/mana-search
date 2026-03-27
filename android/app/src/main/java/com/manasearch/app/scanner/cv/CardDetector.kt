package com.manasearch.app.scanner.cv

import android.graphics.Bitmap
import org.opencv.android.Utils
import org.opencv.core.*
import org.opencv.imgproc.Imgproc
import org.opencv.utils.Converters

object CardDetector {
    
    data class CardDetectionResult(
        val fullCard: Bitmap, 
        val artworkBitmap: Bitmap, 
        val nameBitmap: Bitmap, 
        val corners: List<Point>
    )

    fun extractCardPoints(bitmap: Bitmap): CardDetectionResult? {
        val src = Mat()
        Utils.bitmapToMat(bitmap, src)
        
        val gray = Mat()
        Imgproc.cvtColor(src, gray, Imgproc.COLOR_RGBA2GRAY)
        
        // 1. Moderate Blur: Defeats Moiré without destroying the physical card's border sharpness
        Imgproc.GaussianBlur(gray, gray, Size(7.0, 7.0), 0.0)
        
        // 2. Canny Edge with adaptive sensitivity
        val edged = Mat()
        Imgproc.Canny(gray, edged, 45.0, 150.0)
        
        // 3. Morphological Close to connect broken dashed edge lines on monitors
        val kernel = Imgproc.getStructuringElement(Imgproc.MORPH_RECT, Size(5.0, 5.0))
        Imgproc.morphologyEx(edged, edged, Imgproc.MORPH_CLOSE, kernel)
        
        val contours = mutableListOf<MatOfPoint>()
        val hierarchy = Mat()
        // CRITICAL FIX: RETR_LIST ensures we don't cull Magic cards just because they are displayed INSIDE another rectangle (like a laptop monitor!)
        Imgproc.findContours(edged, contours, hierarchy, Imgproc.RETR_LIST, Imgproc.CHAIN_APPROX_SIMPLE)
        
        // MANABOX PARITY ALGORITHM: We MUST sort by the Bounding Box physical Area, NOT Enclosed pixels!
        // Open bounds (glare) have 0 enclosed pixels but huge bounding boxes. Sorting by contourArea caused the erratic resizing noise lock!
        val boundingBoxes = contours.map { contour ->
            val contour2f = MatOfPoint2f(*contour.toArray())
            val minRect = Imgproc.minAreaRect(contour2f)
            Pair(contour2f, minRect)
        }.sortedByDescending { it.second.size.width * it.second.size.height }.take(10)
        
        var cardContour: MatOfPoint2f? = null
        
        // 4. Area Constraint: Reduced to 5% safe minimum
        val minArea = (src.cols() * src.rows()) * 0.05 
        
        for ((contour2f, minRect) in boundingBoxes) {
            val w = minRect.size.width
            val h = minRect.size.height
            val rectArea = w * h
            
            // 5. Bypass `contourArea` completely! Unclosed glares/broken edge contours have roughly 0 Area! We evaluate the boundary net size instead.
            if (rectArea < minArea) continue
            
            val ratio = maxOf(w, h) / minOf(w, h)
            
            // 6. Generous Aspect Ratio: Any card-like bounding mass spanning 1.15 to 1.70 is violently locked onto.
            if (ratio in 1.15..1.75) {
                // Ensure the line has some structural length to prevent random speckle locking
                val peri = Imgproc.arcLength(contour2f, false)
                if (peri > 100) {
                    // Mapeamento 3D: Abandonamos o Box Flat (minAreaRect) e envelopamos as quebras em um casco convexo (Convex Hull)
                    val hull = MatOfInt()
                    Imgproc.convexHull(MatOfPoint(*contour2f.toArray()), hull)
                    
                    val hullPoints = hull.toArray().map { contour2f.toArray()[it] }
                    
                    if (hullPoints.size >= 4) {
                        // Extração Matemática Direta dos 4 vértices extremos do Polígono em perspectiva 3D (x+y / y-x)
                        val sum = hullPoints.map { it.x + it.y }
                        val diff = hullPoints.map { it.y - it.x }
                        
                        val tl = hullPoints[sum.indexOf(sum.minOrNull() ?: 0)]
                        val br = hullPoints[sum.indexOf(sum.maxOrNull() ?: 0)]
                        val tr = hullPoints[diff.indexOf(diff.minOrNull() ?: 0)]
                        val bl = hullPoints[diff.indexOf(diff.maxOrNull() ?: 0)]
                        
                        // Agora a Lente abraça o Trapézio angular nativamente criando o "Grip" (Grude) nas pontas físicas!
                        cardContour = MatOfPoint2f(tl, tr, br, bl)
                        break
                    }
                }
            }
        }
        
        if (cardContour == null) return null
        
        val points = cardContour.toList()
        
        // Perspective Transformation
        val warpedMat = warpPerspective(src, cardContour)
        val w = warpedMat.width().toDouble()
        val h = warpedMat.height().toDouble()
        
        // Smart Region Cropping
        // Art: 10% to 90% width | 15% to 55% height
        val artRect = Rect(Point(w * 0.1, h * 0.15), Point(w * 0.9, h * 0.55))
        val artCropMat = Mat(warpedMat, artRect)
        val artworkBitmap = Bitmap.createBitmap(artCropMat.cols(), artCropMat.rows(), Bitmap.Config.ARGB_8888)
        Utils.matToBitmap(artCropMat, artworkBitmap)
        
        // Name: 5% to 95% width | 3% to 13% height (Targeting OCR exactly on title bar)
        val nameRect = Rect(Point(w * 0.05, h * 0.01), Point(w * 0.95, h * 0.13))
        val nameCropMat = Mat(warpedMat, nameRect)
        val nameBitmap = Bitmap.createBitmap(nameCropMat.cols(), nameCropMat.rows(), Bitmap.Config.ARGB_8888)
        Utils.matToBitmap(nameCropMat, nameBitmap)

        val fullBmp = Bitmap.createBitmap(warpedMat.cols(), warpedMat.rows(), Bitmap.Config.ARGB_8888)
        Utils.matToBitmap(warpedMat, fullBmp)

        return CardDetectionResult(fullBmp, artworkBitmap, nameBitmap, points)
    }

    fun generatePHash(artBitmap: Bitmap): String {
        val mat = Mat()
        Utils.bitmapToMat(artBitmap, mat)
        
        val gray = Mat()
        Imgproc.cvtColor(mat, gray, Imgproc.COLOR_RGBA2GRAY)
        
        // Histogram Equalization Normalization (Neutralize Flash, Glare, lighting gradients)
        Imgproc.equalizeHist(gray, gray)
        
        val resized = Mat()
        Imgproc.resize(gray, resized, Size(8.0, 8.0))
        
        val meanScalar = Core.mean(resized)
        val meanValue = meanScalar.`val`[0]
        
        var binaryHash = ""
        for (row in 0 until 8) {
            for (col in 0 until 8) {
                val pixel = resized.get(row, col)[0]
                binaryHash += if (pixel >= meanValue) "1" else "0"
            }
        }
        
        return java.math.BigInteger(binaryHash, 2).toString(16).padStart(16, '0')
    }

    private fun warpPerspective(src: Mat, contour: MatOfPoint2f): Mat {
        // Find ordered corners for perfect alignment regardless of rotation
        var points = contour.toArray().toList()
        points = points.sortedBy { it.y }
        val top = points.take(2).sortedBy { it.x }
        val bottom = points.takeLast(2).sortedBy { it.x }
        val orderedPoints = listOf(top[0], top[1], bottom[1], bottom[0]) // TL, TR, BR, BL

        val widthA = Math.hypot(orderedPoints[2].x - orderedPoints[3].x, orderedPoints[2].y - orderedPoints[3].y)
        val widthB = Math.hypot(orderedPoints[1].x - orderedPoints[0].x, orderedPoints[1].y - orderedPoints[0].y)
        val maxWidth = maxOf(widthA, widthB).toInt()

        val heightA = Math.hypot(orderedPoints[1].x - orderedPoints[2].x, orderedPoints[1].y - orderedPoints[2].y)
        val heightB = Math.hypot(orderedPoints[0].x - orderedPoints[3].x, orderedPoints[0].y - orderedPoints[3].y)
        val maxHeight = maxOf(heightA, heightB).toInt()

        val dstPts = listOf(
            Point(0.0, 0.0),
            Point(maxWidth.toDouble() - 1, 0.0),
            Point(maxWidth.toDouble() - 1, maxHeight.toDouble() - 1),
            Point(0.0, maxHeight.toDouble() - 1)
        )

        val srcMat = Converters.vector_Point2f_to_Mat(orderedPoints)
        val dstMat = Converters.vector_Point2f_to_Mat(dstPts)

        val perspectiveTransform = Imgproc.getPerspectiveTransform(srcMat, dstMat)
        val warpedMat = Mat()
        Imgproc.warpPerspective(src, warpedMat, perspectiveTransform, Size(maxWidth.toDouble(), maxHeight.toDouble()))
        
        return warpedMat
    }
}
