package com.manasearch.app;

import android.app.Activity;
import android.content.Intent;
import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.manasearch.app.scanner.ScannerActivity;

@CapacitorPlugin(name = "NativeScanner")
public class NativeScannerPlugin extends Plugin {

    @PluginMethod
    public void startScan(PluginCall call) {
        String apiKey = call.getString("apiKey", "");
        Intent intent = new Intent(getContext(), ScannerActivity.class);
        intent.putExtra("apiKey", apiKey);
        startActivityForResult(call, intent, "scanResult");
    }

    @ActivityCallback
    private void scanResult(PluginCall call, ActivityResult result) {
        if (result.getResultCode() == Activity.RESULT_OK) {
            Intent data = result.getData();
            if (data != null && data.hasExtra("cardName")) {
                JSObject ret = new JSObject();
                ret.put("cardName", data.getStringExtra("cardName"));
                call.resolve(ret);
                return;
            }
        }
        call.reject("Scan cancelled or failed.");
    }

    @PluginMethod
    public void updateDatabase(PluginCall call) {
        String url = call.getString("url", "");
        if (url == null || url.isEmpty()) {
            call.reject("URL cannot be empty");
            return;
        }

        com.manasearch.app.scanner.data.DatabaseDownloader.Companion.downloadDatabase(
            getContext(), 
            url, 
            new com.manasearch.app.scanner.data.DatabaseDownloader.DownloadCallback() {
                @Override
                public void onSuccess() {
                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    call.resolve(ret);
                }

                @Override
                public void onError(String error) {
                    call.reject(error);
                }
            }
        );
    }
}
