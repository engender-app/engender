package dev.engender.app.chrome;

import android.os.Build;
import android.view.View;
import android.view.ViewGroup;

import androidx.annotation.NonNull;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsAnimationCompat;
import androidx.core.view.WindowInsetsCompat;

import java.util.List;

/** Resizes the edge-to-edge WebView with each keyboard animation frame.
 *
 * <p>Capacitor writes the end-state inset. A later content-view listener
 * reapplies each frame's animated inset before layout, clamped to the resting
 * padding. Pinned controls move with the WebView. On animation end,
 * Capacitor applies the resting inset again.
 *
 * <p>Install from API 30. Earlier APIs keep their previous resize behavior.
 * With animations disabled, the final padding arrives in one step.
 */
public final class KeyboardFollow {
    private KeyboardFollow() {}

    /** One keyboard movement: the padding follows the keyboard's own inset
        on every frame, never dropping below the padding the window rests at. */
    static final class Track {
        private boolean running;
        private int rest;
        private int start;
        private int current;

        void prepare(int startPadding) {
            running = true;
            start = startPadding;
            rest = startPadding;
            current = startPadding;
        }

        /** `keyboardHeight` is the keyboard's full inset. A window that is
            already padded by all of it is closing, and rests at nothing. */
        void started(int keyboardHeight) {
            rest = keyboardHeight > 0 && start >= keyboardHeight ? 0 : start;
        }

        /** The keyboard's inset on this frame; returns the padding to draw. */
        int progress(int keyboardInset) {
            current = Math.max(rest, keyboardInset);
            return current;
        }

        /** An insets pass set the padding to `applied`; returns what it should be. */
        int reapply(int applied) {
            return running ? current : applied;
        }

        void finished() {
            running = false;
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
                int padding = track.reapply(decor.getPaddingBottom());
                setBottom(decor, padding);
                // The padding already makes room for the keyboard. The WebView
                // is told the keyboard is only as tall as the navigation bar:
                // with the end state it shrinks its visual viewport in the
                // first frame, and with none it forgets that a keyboard is
                // open and keeps the navigation bar's inset above it.
                WindowInsetsCompat root = ViewCompat.getRootWindowInsets(decor);
                int navigation = root == null ? 0
                    : root.getInsetsIgnoringVisibility(WindowInsetsCompat.Type.navigationBars()).bottom;
                return new WindowInsetsCompat.Builder(ViewCompat.onApplyWindowInsets(v, insets))
                    .setInsets(WindowInsetsCompat.Type.ime(), Insets.of(0, 0, 0, Math.min(padding, navigation)))
                    .build();
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
                track.started(bounds.getUpperBound().bottom);
                return bounds;
            }

            @NonNull
            @Override
            public WindowInsetsCompat onProgress(
                @NonNull WindowInsetsCompat insets,
                @NonNull List<WindowInsetsAnimationCompat> running
            ) {
                if (keyboard != null && running.contains(keyboard)) {
                    setBottom(decor, track.progress(insets.getInsets(WindowInsetsCompat.Type.ime()).bottom));
                }
                return insets;
            }

            @Override
            public void onEnd(@NonNull WindowInsetsAnimationCompat animation) {
                if (animation != keyboard) return;
                keyboard = null;
                track.finished();
                // Capacitor decides where the padding rests; let its listener
                // set it once more now that nothing overrides it.
                decor.requestApplyInsets();
            }
        });
    }

    private static void setBottom(View decor, int bottom) {
        if (decor.getPaddingBottom() == bottom) return;
        decor.setPadding(decor.getPaddingLeft(), decor.getPaddingTop(), decor.getPaddingRight(), bottom);
    }
}
