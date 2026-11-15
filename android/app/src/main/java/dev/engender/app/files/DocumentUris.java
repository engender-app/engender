package dev.engender.app.files;

/**
 * Which URIs the app will open for writing after another app handed them
 * back. A save handler, a folder picker and the persisted folder all answer
 * with a URI the app then opens, truncates and deletes under, so the answer
 * is checked by shape before anything touches it: a {@code file://} URI
 * aimed at the wrapped journal key, an {@code android.resource} URI or a
 * content URI of some other provider would otherwise be written as if the
 * person had chosen it.
 *
 * <p>The shapes are the Storage Access Framework's own: a document is
 * {@code content://authority/document/id} or, below a picked folder,
 * {@code content://authority/tree/treeId/document/id}; a picked folder is
 * {@code content://authority/tree/treeId}. Every provider the system picker
 * offers (Downloads, Drive, an SD card) answers in these shapes, so only a
 * forged answer is refused.
 *
 * <p>Plain strings, so a JVM test holds the rules without a ContentResolver.
 */
public final class DocumentUris {
    private DocumentUris() {}

    private static final String SCHEME = "content://";

    /** A single document: {@code /document/id} or {@code /tree/treeId/document/id}. */
    public static boolean isDocument(String uri) {
        String[] path = path(uri);
        if (path == null) return false;
        if (path.length == 2) return path[0].equals("document");
        return path.length == 4 && path[0].equals("tree") && path[2].equals("document");
    }

    /** A picked folder: {@code /tree/treeId}. */
    public static boolean isTree(String uri) {
        String[] path = path(uri);
        return path != null && path.length == 2 && path[0].equals("tree");
    }

    /** A document below {@code tree}: same authority, same tree id. */
    public static boolean isInTree(String tree, String child) {
        if (!isTree(tree)) return false;
        String[] treePath = path(tree);
        String[] childPath = path(child);
        if (childPath == null || childPath.length != 4 || !isDocument(child)) return false;
        return authority(tree).equals(authority(child)) && treePath[1].equals(childPath[1]);
    }

    private static String authority(String uri) {
        int start = SCHEME.length();
        int end = uri.indexOf('/', start);
        return end < 0 ? uri.substring(start) : uri.substring(start, end);
    }

    /** The path segments after the authority, or null when the URI is not a
        plain content URI: wrong scheme (case counts, ContentResolver compares
        exactly), no authority, a user id or port in the authority
        ({@code 10@provider} reaches another user's provider), a query or
        fragment, or an empty segment. */
    private static String[] path(String uri) {
        if (uri == null || !uri.startsWith(SCHEME)) return null;
        if (uri.indexOf('?') >= 0 || uri.indexOf('#') >= 0) return null;
        String authority = authority(uri);
        if (authority.isEmpty() || authority.indexOf('@') >= 0 || authority.indexOf(':') >= 0) return null;
        int slash = uri.indexOf('/', SCHEME.length());
        if (slash < 0) return null;
        String rest = uri.substring(slash + 1);
        if (rest.isEmpty()) return null;
        String[] segments = rest.split("/", -1);
        for (String segment : segments) if (segment.isEmpty()) return null;
        return segments;
    }
}
