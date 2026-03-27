package com.manasearch.app.scanner.data

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import java.io.FileOutputStream

class DatabaseHelper(private val context: Context) {
    private val dbName = "cards.db"
    private val assetPath = "public/cards.db"
    private var database: SQLiteDatabase? = null

    init {
        open()
    }

    private fun open(): Boolean {
        val dbFile = context.getDatabasePath(dbName)
        // If DB doesn't exist or is smaller than Assets DB (which means it updated), copy it over
        try {
            val assetFd = context.assets.openFd(assetPath)
            val assetLength = assetFd.length
            assetFd.close()

            if (!dbFile.exists() || dbFile.length() < assetLength) {
                dbFile.parentFile?.mkdirs()
                context.assets.open(assetPath).use { input ->
                    FileOutputStream(dbFile).use { output ->
                        input.copyTo(output)
                    }
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
            // Fallback copy without length check if openFd fails
            if (!dbFile.exists()) {
                try {
                    dbFile.parentFile?.mkdirs()
                    context.assets.open(assetPath).use { input ->
                        FileOutputStream(dbFile).use { output ->
                            input.copyTo(output)
                        }
                    }
                } catch(err: Exception) {
                    err.printStackTrace()
                }
            }
        }

        try {
            database = SQLiteDatabase.openDatabase(dbFile.path, null, SQLiteDatabase.OPEN_READONLY)
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return database != null
    }

    fun findBestMatchId(targetHashStr: String): Pair<String, Int>? {
        val db = database ?: return null
        val target = targetHashStr.toULongOrNull(16) ?: return null
        
        var bestMatchId = ""
        var bestDistance = 65
        
        // Android SQLite raw queries are hyper-fast
        db.rawQuery("SELECT id, phash FROM cards", null).use { cursor ->
            val idIndex = cursor.getColumnIndex("id")
            val pHIndex = cursor.getColumnIndex("phash")
            while (cursor.moveToNext()) {
                val id = cursor.getString(idIndex)
                val phashStr = cursor.getString(pHIndex) ?: continue
                val rowHash = phashStr.toULongOrNull(16) ?: continue
                
                val distance = (target xor rowHash).countOneBits()
                if (distance < bestDistance) {
                    bestDistance = distance
                    bestMatchId = id
                    // Perfect visual match threshold
                    if (distance <= 2) break
                }
            }
        }
        
        // Threshold: Tightened to <= 10 to avoid false positives (random cards) when the real card isn't downloaded yet.
        if (bestMatchId.isNotEmpty() && bestDistance <= 10) {
            return Pair(bestMatchId, bestDistance)
        }
        return null
    }
}
