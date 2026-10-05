package dev.engender.app.lock;

/**
 * Whether the screen covering the app right now is one the app opened for a
 * result: a photo or document picker, a folder or save picker, the camera, or
 * a permission dialog. Each of those is a separate activity, so the app is
 * paused and usually stopped while the person is still in the middle of
 * something here. Leaving to that screen is not leaving the app, and locking
 * on it sent somebody attaching a photo back to the lock screen.
 *
 * Opened as the request goes out and closed when its result comes back, which
 * Android delivers before the app resumes. A plain startActivity reaches
 * startActivityForResult with a negative request code and opens nothing: the
 * settings pages the app links to are somewhere else, and going there locks.
 */
public final class OwnSystemUi {
    private boolean open;

    public synchronized void opened(int requestCode) {
        if (requestCode >= 0) open = true;
    }

    public synchronized void closed() {
        open = false;
    }

    public synchronized boolean isOpen() {
        return open;
    }
}
