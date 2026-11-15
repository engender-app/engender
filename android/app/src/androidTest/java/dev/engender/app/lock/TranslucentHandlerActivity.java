package dev.engender.app.lock;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;

/** Stands in for an app that answers a picker or camera intent with a translucent screen. */
public class TranslucentHandlerActivity extends Activity {
    /** Runs on the main thread the first time the handler draws a frame. */
    public static volatile Runnable onFirstFrame;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        View view = new View(this);
        view.setBackgroundColor(Color.argb(0x20, 0, 0, 0));
        setContentView(view);
        view.getViewTreeObserver().addOnPreDrawListener(new android.view.ViewTreeObserver.OnPreDrawListener() {
            @Override public boolean onPreDraw() {
                view.getViewTreeObserver().removeOnPreDrawListener(this);
                Runnable hook = onFirstFrame;
                if (hook != null) hook.run();
                return true;
            }
        });
    }
}
