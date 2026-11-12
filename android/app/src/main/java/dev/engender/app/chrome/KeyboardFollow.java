package dev.engender.app.chrome;

import android.os.Build;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;

import androidx.annotation.NonNull;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsAnimationCompat;
import androidx.core.view.WindowInsetsCompat;

import java.util.List;

/**
 * The app's window follows the keyboard frame by frame (tester report 02,
 * ticket 04).
 *
 * The app is edge-to-edge, so nothing resizes it for the keyboard on its
 * own: Capacitor's SystemBars listener pads the decor view's bottom by the
 * keyboard's height, and the WebView inside shrinks by that much. Window
 * insets are applied once per keyboard change, at the end state, so that
 * padding arrived in one step: on a Pixel 10a the page went from 923 to 564
 * css px in a single frame and the pinned "Save entry" jumped 335.6 px,
 * with up to six frames before that in which the rising keyboard covered it.
 *
 * The platform does report the keyboard's movement on every frame, to an
 * insets animation callback. This one lets the end-state padding land, puts
 * the padding back where it was before the first frame is drawn, and then
 * moves it from there to the end on each frame by the animation's own
 * interpolated fraction, so the page's bottom edge rides on the keyboard's
 * top. The WebView resizes with it, so every pinned control and the focused
 * field follow the window as they do on any resize, with no code in the
 * page. What the padding ends at is still whatever Capacitor decided.
 *
 * Android 11 (API 30) is where the platform reports the keyboard's real
 * movement. Below that the compat library only simulates it, so nothing is
 * installed and the window resizes as it always has. With animations off
 * there is no movement to follow and the padding lands in one step, as the
 * keyboard itself does.
 */
public final class KeyboardFollow {
    private KeyboardFollow() {}

    /** The bottom padding for a keyboard `fraction` of the way through its
        movement, from `start` to `end`. */
    static int paddingAt(int start, int end, float fraction) {
        float f = Math.max(0f, Math.min(1f, fraction));
        return Math.round(start + (end - start) * f);
    }

    /** One keyboard movement: where the padding started, where Capacitor's
        listener wants it to end, and where the current frame puts it. */
    static final class Track {
        private boolean running;
        private int start;
        private int end;
        private int current;

        void prepare(int startPadding) {
            running = true;
            start = startPadding;
            end = startPadding;
            current = startPadding;
        }

        /** The end-state padding has landed; returns what the first frame draws. */
        int started(int endPadding) {
            end = endPadding;
            current = start;
            return current;
        }

        int progress(float fraction) {
            current = paddingAt(start, end, fraction);
            return current;
        }

        /** An insets pass set the padding to `applied`; returns what it should be. */
        int reapply(int applied) {
            return running ? current : applied;
        }

        int finished() {
            running = false;
            return end;
        }

        boolean running() {
            return running;
        }
    }

    public static void install(View decor) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return;
        final Track track = new Track();
        // Capacitor's SystemBars listener sits on the decor view and sets the
        // end padding again on every insets pass, also in the middle of the
        // movement. The pass then goes on to the content view below it, so a
        // listener there runs after Capacitor's, in the same pass and before
        // the layout, and puts the frame's padding back.
        View content = decor instanceof ViewGroup ? ((ViewGroup) decor).getChildAt(0) : null;
        if (content != null) {
            ViewCompat.setOnApplyWindowInsetsListener(content, (v, insets) -> {
                Log.d("KBF", "content-pass running=" + track.running() + " pad=" + decor.getPaddingBottom());
                setBottom(decor, track.reapply(decor.getPaddingBottom()));
                return ViewCompat.onApplyWindowInsets(v, insets);
            });
        }
        ViewCompat.setWindowInsetsAnimationCallback(decor, new WindowInsetsAnimationCompat.Callback(
            WindowInsetsAnimationCompat.Callback.DISPATCH_MODE_CONTINUE_ON_SUBTREE) {
            private WindowInsetsAnimationCompat keyboard;

            @Override
            public void onPrepare(@NonNull WindowInsetsAnimationCompat animation) {
                if ((animation.getTypeMask() & WindowInsetsCompat.Type.ime()) == 0) return;
                keyboard = animation;
                track.prepare(decor.getPaddingBottom());
            }

            @NonNull
            @Override
            public WindowInsetsAnimationCompat.BoundsCompat onStart(
                @NonNull WindowInsetsAnimationCompat animation,
                @NonNull WindowInsetsAnimationCompat.BoundsCompat bounds
            ) {
                if (animation != keyboard) return bounds;
                // The end state is applied by now; draw the first frame at
                // the start instead.
                setBottom(decor, track.started(decor.getPaddingBottom()));
                return bounds;
            }

            @NonNull
            @Override
            public WindowInsetsCompat onProgress(
                @NonNull WindowInsetsCompat insets,
                @NonNull List<WindowInsetsAnimationCompat> running
            ) {
                Log.d("KBF", "progress run=" + (keyboard != null && running.contains(keyboard)) + " pad=" + decor.getPaddingBottom());
                if (keyboard != null && running.contains(keyboard)) {
                    setBottom(decor, track.progress(keyboard.getInterpolatedFraction()));
                }
                return insets;
            }

            @Override
            public void onEnd(@NonNull WindowInsetsAnimationCompat animation) {
                if (animation != keyboard) return;
                keyboard = null;
                setBottom(decor, track.finished());
            }
        });
    }

    private static void setBottom(View decor, int bottom) {
        if (decor.getPaddingBottom() == bottom) return;
        decor.setPadding(decor.getPaddingLeft(), decor.getPaddingTop(), decor.getPaddingRight(), bottom);
    }
}
