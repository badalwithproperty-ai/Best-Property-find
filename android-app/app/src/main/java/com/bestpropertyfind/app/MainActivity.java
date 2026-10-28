package com.bestpropertyfind.app;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebSettings;
import android.view.ViewGroup;
import android.view.KeyEvent;

public class MainActivity extends Activity {
    private WebView webView;
    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        webView.setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());
        setContentView(webView);
        if (savedInstanceState == null) webView.loadUrl("https://badalwithproperty-ai.github.io/Best-Property-find/");
        else webView.restoreState(savedInstanceState);
    }
    @Override protected void onSaveInstanceState(Bundle outState) { super.onSaveInstanceState(outState); if (webView != null) webView.saveState(outState); }
    @Override public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView != null && webView.canGoBack()) { webView.goBack(); return true; }
        return super.onKeyDown(keyCode, event);
    }
    @Override protected void onDestroy() { if (webView != null) webView.destroy(); super.onDestroy(); }
}
