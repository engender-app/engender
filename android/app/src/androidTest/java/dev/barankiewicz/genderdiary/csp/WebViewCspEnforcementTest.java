package dev.barankiewicz.genderdiary.csp;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import dev.barankiewicz.genderdiary.MainActivity;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Whether the Capacitor shell enforces the document's Content Security Policy
 * (phase 5 security ticket 03, audit finding F-06).
 *
 * <p>The policy used to be split: nginx sent everything except the script
 * hashes, and the build wrote the hashes into the document because only a build
 * knows them. The Capacitor shell serves its own origin out of the APK and
 * never sees an nginx header, so on Android the enforced policy was the script
 * half and nothing else - no connect-src, which is what turns a successful
 * script injection into something that cannot send the journal's data key
 * anywhere. The key crosses the bridge as hex and lives in JS memory for the
 * session, and Android is the platform holding real journals.
 *
 * <p>The whole set now travels in the document. That fixes nothing unless this
 * WebView actually applies a meta policy, and a policy it ignored would be
 * worse than the old state because it would read as coverage. So this asserts
 * enforcement rather than presence: an off-origin fetch has to raise a
 * connect-src violation, which only a live policy can produce - no network is
 * involved and the emulator's connectivity does not enter into it.
 *
 * <p>The other half is that the policy is not too narrow. blob: URLs are how
 * three things in this app work - a photo thumbnail decrypted into memory, a
 * voice note or timelapse fed to its player, and the OCR worker tesseract.js
 * constructs - and each is loaded here through the real policy. A too-narrow
 * directive shows up as a violation naming it.
 *
 * <p>evaluateJavascript is the probe vehicle. It runs outside the page's
 * script-src, which is why it can install the listener at all;
 * WebViewPrintAdapterTest drives the bridge the same way.
 */
@RunWith(AndroidJUnit4.class)
public class WebViewCspEnforcementTest {

    private static final long TIMEOUT_SECONDS = 90;

    /**
     * Every directive the document has to carry. frame-ancestors is absent on
     * purpose: a browser parses it in a meta policy and ignores it, so the
     * nginx header stays its only home and nothing frames this WebView.
     * tests/csp.test.ts pins the sources; this pins that they arrive here.
     */
    private static final String[] REQUIRED_DIRECTIVES = {
        "default-src", "base-uri", "object-src", "frame-src", "form-action",
        "script-src", "style-src", "img-src", "font-src", "connect-src",
        "worker-src", "manifest-src", "media-src"
    };

    /** A 1x1 transparent PNG, so the image the blob carries really decodes. */
    private static final String ONE_PIXEL_PNG_BASE64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

    @Test
    public void theShellEnforcesTheDocumentsPolicyAndStillAllowsWhatTheAppNeeds() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            // The app's own scripts ran under the policy, so boot is not blocked by it.
            awaitTrue(scenario, "!!document.querySelector('[data-app-root]')");

            evaluate(scenario, probe());
            assertEquals(
                "the probe never settled", "true", awaitValue(scenario, "!!window.__csp.done", "true"));

            String policy = string(evaluate(scenario, "window.__csp.policy"));
            assertTrue("the document in the shell carries no meta CSP at all", policy != null);
            for (String directive : REQUIRED_DIRECTIVES) {
                assertTrue(
                    "the shell's document is missing " + directive + ", policy was: " + policy,
                    policy.contains(directive));
            }

            // Enforcement. A dead policy lets the request leave and reports nothing.
            assertEquals(
                "an off-origin fetch was not refused",
                "\"refused\"",
                evaluate(scenario, "window.__csp.offOrigin"));
            assertEquals(
                "no connect-src violation, so the meta policy is parsed but not enforced",
                "true",
                evaluate(scenario, "window.__csp.violations.some(function(v){return v.directive==='connect-src'})"));

            // Not too narrow: the app's own assets, and the three blob: cases.
            assertEquals(
                "connect-src refused the app's own bundled assets, which is OCR's language data",
                "\"allowed\"",
                evaluate(scenario, "window.__csp.sameOrigin"));
            assertEquals("a blob: image was refused", "\"load\"", evaluate(scenario, "window.__csp.image"));
            assertEquals("a blob: worker was refused", "\"message\"", evaluate(scenario, "window.__csp.worker"));
            assertEquals(
                "a blob: media source raised a violation",
                "0",
                evaluate(
                    scenario,
                    "window.__csp.violations.filter(function(v){"
                        + "return v.directive==='media-src'||v.directive==='img-src'||v.directive==='worker-src'})"
                        + ".length"));
        }
    }

    /**
     * Installs a violation listener, then exercises the four cases and sets
     * `window.__csp.done`. One string because evaluateJavascript takes one.
     */
    private static String probe() {
        return "(function(){"
            + "window.__csp={violations:[],done:false};"
            + "document.addEventListener('securitypolicyviolation',function(e){"
            + "window.__csp.violations.push({directive:e.effectiveDirective||e.violatedDirective,uri:e.blockedURI});"
            + "});"
            + "var meta=document.querySelector('meta[http-equiv=\"content-security-policy\"]');"
            + "window.__csp.policy=meta?meta.getAttribute('content'):null;"
            + "var png=Uint8Array.from(atob('" + ONE_PIXEL_PNG_BASE64 + "'),function(c){return c.charCodeAt(0)});"
            /* A photo thumbnail: decrypted bytes, an object URL, an <img>. */
            + "var image=new Promise(function(done){"
            + "var img=new Image();"
            + "img.onload=function(){done('load')};img.onerror=function(){done('error')};"
            + "img.src=URL.createObjectURL(new Blob([png],{type:'image/png'}));"
            + "});"
            /* A voice note and a timelapse preview. The bytes are not real media,
               so an <audio>/<video> ends in an error either way - what separates a
               narrow policy from a decode failure is whether media-src fires. */
            + "['audio','video'].forEach(function(tag){"
            + "var el=document.createElement(tag);"
            + "el.src=URL.createObjectURL(new Blob([png],{type:tag+'/webm'}));"
            + "el.load();"
            + "});"
            /* The OCR worker tesseract.js constructs from an object URL. */
            + "var worker=new Promise(function(done){"
            + "try{"
            + "var w=new Worker(URL.createObjectURL(new Blob(['self.postMessage(1)'],{type:'text/javascript'})));"
            + "w.onmessage=function(){w.terminate();done('message')};"
            + "w.onerror=function(){w.terminate();done('error')};"
            + "}catch(e){done('threw: '+e)}"
            + "});"
            /* The directive the audit was about. No network reaches this: a live
               policy refuses it before the request is made. */
            + "var offOrigin=fetch('https://example.com/csp-probe')"
            + ".then(function(){return 'allowed'}).catch(function(){return 'refused'});"
            /* The other side of connect-src 'self': OCR reads its Tesseract core
               and language data off the app's own origin, so a policy that
               refused this would take the whole feature with it. */
            + "var sameOrigin=fetch('/tesseract/worker.min.js')"
            + ".then(function(r){return r.ok?'allowed':'status '+r.status})"
            + ".catch(function(e){return 'refused: '+e});"
            + "Promise.all([image,worker,offOrigin,sameOrigin]).then(function(r){"
            + "window.__csp.image=r[0];window.__csp.worker=r[1];"
            + "window.__csp.offOrigin=r[2];window.__csp.sameOrigin=r[3];"
            /* One turn of the event loop after the media elements were told to
               load, so a violation they raise is in the list before it is read. */
            + "setTimeout(function(){window.__csp.done=true},1000);"
            + "});"
            + "return 'installed';"
            + "})()";
    }

    /** evaluateJavascript returns JSON, so a string arrives quoted or as `null`. */
    private static String string(String json) {
        if (json == null || "null".equals(json)) return null;
        return json.startsWith("\"") ? json.substring(1, json.length() - 1) : json;
    }

    private static void awaitTrue(ActivityScenario<MainActivity> scenario, String expression)
        throws InterruptedException {
        assertEquals("never became true: " + expression, "true", awaitValue(scenario, expression, "true"));
    }

    /** Polls `expression` until it equals `wanted`, then returns what it last saw. */
    private static String awaitValue(ActivityScenario<MainActivity> scenario, String expression, String wanted)
        throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(TIMEOUT_SECONDS);
        String seen = null;
        while (System.nanoTime() < deadline) {
            seen = evaluate(scenario, expression);
            if (wanted.equals(seen)) return seen;
            Thread.sleep(250);
        }
        return seen;
    }

    private static String evaluate(ActivityScenario<MainActivity> scenario, String expression)
        throws InterruptedException {
        AtomicReference<String> value = new AtomicReference<>();
        CountDownLatch evaluated = new CountDownLatch(1);
        scenario.onActivity(
            activity ->
                activity
                    .getBridge()
                    .getWebView()
                    .evaluateJavascript(
                        expression,
                        result -> {
                            value.set(result);
                            evaluated.countDown();
                        }));
        if (!evaluated.await(10, TimeUnit.SECONDS)) throw new AssertionError("the WebView stopped answering");
        return value.get();
    }
}
