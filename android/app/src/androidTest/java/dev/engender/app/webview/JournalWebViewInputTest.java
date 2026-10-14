package dev.engender.app.webview;

import static org.junit.Assert.*;
import static org.junit.Assume.assumeTrue;

import android.content.Context;
import android.os.Build;
import android.text.InputType;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebView;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import com.getcapacitor.CapacitorWebView;
import dev.engender.app.MainActivity;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Reads the editor contract after focusing real HTML fields in the app's WebView. */
@RunWith(AndroidJUnit4.class)
public class JournalWebViewInputTest {
    private static final String FIELDS = "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        + "<textarea id='note' autocorrect='on' spellcheck='true'>NN</textarea>"
        + "<input id='name' type='text' value='NNNN' enterkeyhint='go' autocorrect='on' spellcheck='true'>"
        + "<input id='search' type='search' value='NNNNNN' enterkeyhint='search'>"
        + "<input id='password' type='password' value='NNNNNNNN'>";

    @Test public void noteRequestsNoLearningAndKeepsMultilineInput() throws Exception { check("note"); }
    @Test public void textRequestsNoLearningAndKeepsItsAction() throws Exception { check("name"); }
    @Test public void searchRequestsNoLearningAndKeepsSearchAction() throws Exception { check("search"); }
    @Test public void passwordAlsoRequestsNoLearning() throws Exception { check("password"); }

    @Test public void baselineActionsFromUntouchedCapacitor() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AtomicReference<CapacitorWebView> baseline = new AtomicReference<>();
            scenario.onActivity(activity -> {
                CapacitorWebView view = new CapacitorWebView(activity, null);
                view.setBridge(activity.getBridge());
                view.getSettings().setJavaScriptEnabled(true);
                activity.addContentView(view, new android.view.ViewGroup.LayoutParams(
                    android.view.ViewGroup.LayoutParams.MATCH_PARENT, android.view.ViewGroup.LayoutParams.MATCH_PARENT));
                view.loadDataWithBaseURL("https://localhost/", FIELDS, "text/html", "UTF-8", null);
                baseline.set(view);
            });
            try {
                for (String field : new String[] { "note", "name", "search", "password" }) {
                    AtomicReference<EditorInfo> seen = new AtomicReference<>();
                    long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
                    while (seen.get() == null && System.nanoTime() < deadline) {
                        scenario.onActivity(activity -> {
                            CapacitorWebView view = baseline.get();
                            view.requestFocus();
                            view.evaluateJavascript("(function(){var field=document.getElementById('" + field
                                + "');if(!field)return false;field.focus();field.setSelectionRange(field.value.length,field.value.length);return field.value.length})()", result -> {
                                if ("false".equals(result)) return;
                                int marker = Integer.parseInt(result);
                                EditorInfo info = new EditorInfo();
                                if (view.onCreateInputConnection(info) != null
                                    && (info.inputType & InputType.TYPE_MASK_CLASS) == InputType.TYPE_CLASS_TEXT
                                    && info.initialSelStart == marker && info.initialSelEnd == marker) seen.set(info);
                            });
                        });
                        if (seen.get() == null) Thread.sleep(250);
                    }
                    assertNotNull("baseline focused field has no input connection: " + field, seen.get());
                    if ("name".equals(field)) assertEquals(EditorInfo.IME_ACTION_GO, seen.get().imeOptions & EditorInfo.IME_MASK_ACTION);
                    if ("search".equals(field)) assertEquals(EditorInfo.IME_ACTION_SEARCH, seen.get().imeOptions & EditorInfo.IME_MASK_ACTION);
                    System.out.println("Capacitor baseline " + field + ": inputType=" + seen.get().inputType
                        + " imeOptions=" + seen.get().imeOptions + " action=" + (seen.get().imeOptions & EditorInfo.IME_MASK_ACTION));
                }
            } finally {
                scenario.onActivity(activity -> {
                    CapacitorWebView view = baseline.get();
                    ((android.view.ViewGroup) view.getParent()).removeView(view);
                    view.destroy();
                });
            }
        }
    }

    private void check(String field) throws Exception {
        Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assumeTrue("use an isolated app or disposable emulator",
            app.getPackageName().startsWith("dev.engender.app.test.")
                || Build.HARDWARE.contains("ranchu") || Build.HARDWARE.contains("goldfish"));
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> {
                WebView view = activity.getBridge().getWebView();
                assertTrue("the Capacitor input owner was replaced", view instanceof CapacitorWebView);
                view.loadDataWithBaseURL("https://localhost/", FIELDS, "text/html", "UTF-8", null);
            });
            WebViewProbe page = new WebViewProbe(scenario, 10);
            page.awaitTrue("Boolean(document.getElementById('password'))");
            int marker = Integer.parseInt(page.evaluate("(function(){var field=document.getElementById('" + field
                + "');field.focus();field.setSelectionRange(field.value.length,field.value.length);return field.value.length})()"));
            page.awaitTrue("document.activeElement.id === '" + field + "'");
            AtomicReference<EditorInfo> seen = new AtomicReference<>();
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
            while (seen.get() == null && System.nanoTime() < deadline) {
                scenario.onActivity(activity -> {
                    WebView view = activity.getBridge().getWebView();
                    view.requestFocus();
                    EditorInfo info = new EditorInfo();
                    InputConnection connection = view.onCreateInputConnection(info);
                    // DOM focus can precede the native editor update. Each
                    // field's selection endpoint identifies its current state.
                    if (connection != null && info.initialSelStart == marker && info.initialSelEnd == marker) seen.set(info);
                });
                if (seen.get() == null) Thread.sleep(250);
            }
            EditorInfo info = seen.get();
            assertNotNull("focused field has no input connection", info);
            assertEquals("field type was lost", InputType.TYPE_CLASS_TEXT, info.inputType & InputType.TYPE_MASK_CLASS);
            if ("note".equals(field)) assertNotEquals(0, info.inputType & InputType.TYPE_TEXT_FLAG_MULTI_LINE);
            if ("name".equals(field)) assertEquals(EditorInfo.IME_ACTION_GO, info.imeOptions & EditorInfo.IME_MASK_ACTION);
            if ("search".equals(field)) assertEquals(EditorInfo.IME_ACTION_SEARCH, info.imeOptions & EditorInfo.IME_MASK_ACTION);
            assertNotEquals("keyboard learning was not disabled for " + field, 0,
                info.imeOptions & EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING);
            scenario.onActivity(activity -> ((InputMethodManager) activity.getSystemService(Context.INPUT_METHOD_SERVICE))
                .hideSoftInputFromWindow(activity.getBridge().getWebView().getWindowToken(), 0));
        }
    }
}
