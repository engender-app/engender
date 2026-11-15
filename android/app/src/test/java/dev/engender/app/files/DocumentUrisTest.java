package dev.engender.app.files;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class DocumentUrisTest {
    private static final String TREE = "content://com.android.externalstorage.documents/tree/primary%3ABackups";

    @Test public void theSystemPickersOwnShapesAreAccepted() {
        assertTrue(DocumentUris.isDocument("content://com.android.providers.downloads.documents/document/msf%3A42"));
        assertTrue(DocumentUris.isDocument("content://com.google.android.apps.docs.storage/document/acc%3D1%3Bdoc%3Dencoded%3DAbC"));
        assertTrue(DocumentUris.isDocument(TREE + "/document/primary%3ABackups%2Fa.ttbackup"));
        assertTrue(DocumentUris.isTree(TREE));
    }

    @Test public void aFileResourceOrUnknownSchemeIsNotADocument() {
        for (String uri : new String[] {
            "file:///data/user/0/dev.engender.app/no_backup/journal-key.wrapped",
            "android.resource://dev.engender.app/raw/x",
            "http://example.com/document/1",
            "CONTENT://com.android.externalstorage.documents/document/1",
            "content:/com.android.externalstorage.documents/document/1",
            "ftp://x/document/1", "", null }) {
            assertFalse(String.valueOf(uri), DocumentUris.isDocument(uri));
            assertFalse(String.valueOf(uri), DocumentUris.isTree(uri));
        }
    }

    @Test public void aContentUriThatIsNotADocumentIsRefused() {
        // The app's own FileProvider, a media URI and a bare authority are content URIs but not documents.
        assertFalse(DocumentUris.isDocument("content://dev.engender.app.camera-files/capture/capture.jpg"));
        assertFalse(DocumentUris.isDocument("content://media/external/images/media/7"));
        assertFalse(DocumentUris.isDocument("content://com.android.externalstorage.documents"));
        assertFalse(DocumentUris.isDocument("content://com.android.externalstorage.documents/"));
        assertFalse(DocumentUris.isDocument("content://com.android.externalstorage.documents/document/"));
        assertFalse(DocumentUris.isDocument("content://com.android.externalstorage.documents/document//x"));
        assertFalse(DocumentUris.isDocument("content://com.android.externalstorage.documents/tree/a/b/document/c"));
        assertFalse(DocumentUris.isDocument(TREE));
    }

    @Test public void aUserIdPortQueryOrFragmentIsRefused() {
        assertFalse(DocumentUris.isDocument("content://10@com.android.externalstorage.documents/document/1"));
        assertFalse(DocumentUris.isDocument("content://com.android.externalstorage.documents:80/document/1"));
        assertFalse(DocumentUris.isDocument("content://com.android.externalstorage.documents/document/1?x=1"));
        assertFalse(DocumentUris.isDocument("content://com.android.externalstorage.documents/document/1#x"));
        assertFalse(DocumentUris.isTree("content://10@com.android.externalstorage.documents/tree/a"));
    }

    @Test public void aTreeIsExactlyTheTreeSegments() {
        assertFalse(DocumentUris.isTree("file:///sdcard/Backups"));
        assertFalse(DocumentUris.isTree("content://com.android.externalstorage.documents/tree"));
        assertFalse(DocumentUris.isTree("content://com.android.externalstorage.documents/document/a"));
        assertFalse(DocumentUris.isTree(TREE + "/document/x"));
    }

    @Test public void aChildMustBeInTheSameTreeOfTheSameProvider() {
        assertTrue(DocumentUris.isInTree(TREE, TREE + "/document/primary%3ABackups%2Fa.ttbackup"));
        assertFalse("another authority",
            DocumentUris.isInTree(TREE, "content://com.evil.provider/tree/primary%3ABackups/document/x"));
        assertFalse("another tree",
            DocumentUris.isInTree(TREE, "content://com.android.externalstorage.documents/tree/primary%3AOther/document/x"));
        assertFalse("file scheme", DocumentUris.isInTree(TREE, "file:///data/user/0/dev.engender.app/no_backup/journal-key.wrapped"));
        assertFalse("no tree segment", DocumentUris.isInTree(TREE, "content://com.android.externalstorage.documents/document/x"));
        assertFalse("tree itself", DocumentUris.isInTree(TREE, TREE));
        assertFalse("bad tree", DocumentUris.isInTree("file:///x", TREE + "/document/x"));
    }
}
