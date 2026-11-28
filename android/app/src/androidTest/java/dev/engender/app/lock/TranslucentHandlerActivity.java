package dev.engender.app.lock;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;

/** Stands in for an app that answers a picker or camera intent with a translucent screen. */
public class TranslucentHandlerActivity extends Activity {
    /** Broadcast to the app (package named by the "notify" extra) when the handler first draws.
        The handler lives in the test package's process, so a callback cannot cross to the app. */
    public static final String DREW = "dev.engender.app.test.HANDLER_DREW";

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        View view = new View(this);
        view.setBackgroundColor(Color.argb(0x20, 0, 0, 0));
        setContentView(view);
        view.getViewTreeObserver().addOnPreDrawListener(new android.view.ViewTreeObserver.OnPreDrawListener() {
            @Override public boolean onPreDraw() {
                view.getViewTreeObserver().removeOnPreDrawListener(this);
                String app = getIntent().getStringExtra("notify");
                if (app != null) sendBroadcast(new android.content.Intent(DREW).setPackage(app));
                return true;
            }
        });
    }
}
