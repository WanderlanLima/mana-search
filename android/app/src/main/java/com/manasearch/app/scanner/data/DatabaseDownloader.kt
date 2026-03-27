package com.manasearch.app.scanner.data

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

class DatabaseDownloader {

    interface DownloadCallback {
        fun onSuccess()
        fun onError(error: String)
    }

    companion object {
        fun downloadDatabase(context: Context, downloadUrl: String, callback: DownloadCallback) {
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    val url = URL(downloadUrl)
                    val connection = url.openConnection() as HttpURLConnection
                    connection.requestMethod = "GET"
                    connection.instanceFollowRedirects = true
                    connection.connectTimeout = 15000
                    connection.readTimeout = 60000
                    connection.connect()

                    var finalConnection = connection
                    var responseCode = connection.responseCode
                    
                    // Manual redirect follow for cross-domain (GitHub to S3 CDN)
                    if (responseCode == HttpURLConnection.HTTP_MOVED_TEMP || 
                        responseCode == HttpURLConnection.HTTP_MOVED_PERM || 
                        responseCode == HttpURLConnection.HTTP_SEE_OTHER ||
                        responseCode == 302) {
                        val redirectUrl = connection.getHeaderField("Location")
                        finalConnection = URL(redirectUrl).openConnection() as HttpURLConnection
                        finalConnection.connectTimeout = 15000
                        finalConnection.connect()
                        responseCode = finalConnection.responseCode
                    }

                    if (responseCode != HttpURLConnection.HTTP_OK) {
                        withContext(Dispatchers.Main) {
                            callback.onError("Server returned HTTP " + responseCode)
                        }
                        return@launch
                    }

                    downloadStream(context, finalConnection.inputStream, callback)

                } catch (e: Exception) {
                    e.printStackTrace()
                    withContext(Dispatchers.Main) {
                        callback.onError(e.message ?: "Unknown network error downloading database")
                    }
                }
            }
        }

        private suspend fun downloadStream(context: Context, inputStream: InputStream, callback: DownloadCallback) {
            try {
                // Download to a temporary file first safely
                val tempFile = File(context.cacheDir, "cards_temp.db")
                val outputStream = FileOutputStream(tempFile)
                
                val buffer = ByteArray(8192)
                var bytesRead: Int
                while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                    outputStream.write(buffer, 0, bytesRead)
                }
                
                outputStream.flush()
                outputStream.close()
                inputStream.close()
                
                // Atomically overwrite the actual Application DB
                val dbFile = context.getDatabasePath("cards.db")
                dbFile.parentFile?.mkdirs()
                
                if (dbFile.exists()) {
                    dbFile.delete()
                }
                
                tempFile.renameTo(dbFile)
                
                // Done!
                withContext(Dispatchers.Main) {
                    callback.onSuccess()
                }
            } catch (e: Exception) {
                e.printStackTrace()
                withContext(Dispatchers.Main) {
                    callback.onError(e.message ?: "Storage permissions or Space error")
                }
            }
        }
    }
}
