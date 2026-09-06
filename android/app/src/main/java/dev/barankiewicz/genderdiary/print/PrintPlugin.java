package dev.barankiewicz.genderdiary.print;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Hands the WebView's current page to Android's print stack.
 *
 * `window.print()` is a Chrome method, not a WebView one: inside a Capacitor
 * app it returns without doing anything and without failing, so the clinician
 * visit summary's print button has been dead on Android since it was built
 * and the journal book's would have been dead the day it shipped. There is no
 * web API that reaches Android's print dialog, so this is the whole reason
 * the plugin exists.
 *
 * What it prints is the live WebView, so the `@media print` rules in app.css
 * and each screen's own block decide the page exactly as they do on the web.
 * Nothing is rendered a second time here and nothing is written to disk:
 * PrintManager owns the output, and where it goes - a printer, or the
 * system's own Save as PDF - is the person's choice in a dialog this app
 * never sees the result of.
 */
@CapacitorPlugin(name = "Print")
public class PrintPlugin extends Plugin {

    @PluginMethod
    public void print(PluginCall call) {
        String jobName = call.getString("jobName");
        if (jobName == null || jobName.trim().isEmpty()) {
            call.reject("a print job needs a name");
            return;
        }

        WebView webView = getBridge().getWebView();
        if (webView == null) {
            call.reject("no web view to print");
            return;
        }

        Context context = getContext();
        PrintManager printManager = (PrintManager) context.getSystemService(Context.PRINT_SERVICE);
        if (printManager == null) {
            call.reject("this device has no print service");
            return;
        }

        /* createPrintDocumentAdapter and PrintManager.print both touch the
           view, so both belong on the UI thread - the bridge calls plugin
           methods off it. */
        getActivity().runOnUiThread(() -> {
            try {
                // The named overload, unconditionally: minSdkVersion is 26
                // (variables.gradle) and the unnamed one it replaced was
                // deprecated at 21.
                PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(jobName);
                printManager.print(jobName, adapter, new PrintAttributes.Builder().build());
                call.resolve();
            } catch (Exception e) {
                call.reject("could not open the print dialog", e);
            }
        });
    }
}
