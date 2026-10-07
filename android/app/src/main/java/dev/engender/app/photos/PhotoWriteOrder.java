package dev.engender.app.photos;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/** Reserves file order before channel bytes arrive. Waiting for bytes or a
 * previous write never occupies a worker, so other files can still write. */
final class PhotoWriteOrder implements AutoCloseable {
    interface Writer {
        void write(byte[] bytes) throws IOException;
    }

    // Matches restore.ts's FILE_WRITE_CONCURRENCY across both transports.
    private final ExecutorService workers = Executors.newFixedThreadPool(8);
    private final ScheduledThreadPoolExecutor timeouts = new ScheduledThreadPoolExecutor(1);
    private final Map<String, CompletableFuture<Void>> tails = new HashMap<>();

    PhotoWriteOrder() {
        timeouts.setRemoveOnCancelPolicy(true);
    }

    final class Request {
        private final CompletableFuture<byte[]> bytes = new CompletableFuture<>();
        final CompletableFuture<Void> result;
        private final ScheduledFuture<?> timeout;

        Request(CompletableFuture<Void> previous, Writer writer, long waitMs) {
            timeout = timeouts.schedule(() -> bytes.completeExceptionally(new IOException("photo write channel timed out waiting for bytes")),
                    waitMs, TimeUnit.MILLISECONDS);
            result = previous.handle((ignored, error) -> null)
                    .thenCompose(ignored -> bytes)
                    .thenAcceptAsync(payload -> {
                        try {
                            writer.write(payload);
                        } catch (IOException error) {
                            throw new CompletionException(error);
                        }
                    }, workers);
        }

        void accept(byte[] payload) {
            if (bytes.complete(payload)) timeout.cancel(false);
        }

        void fail(Exception error) {
            if (bytes.completeExceptionally(error)) timeout.cancel(false);
        }
    }

    synchronized Request reserve(String path, Writer writer) {
        return reserve(path, writer, 30_000);
    }

    synchronized Request reserve(String path, Writer writer, long waitMs) {
        CompletableFuture<Void> previous = tails.getOrDefault(path, CompletableFuture.completedFuture(null));
        Request request = new Request(previous, writer, waitMs);
        tails.put(path, request.result);
        request.result.whenComplete((ignored, error) -> {
            synchronized (PhotoWriteOrder.this) {
                if (tails.get(path) == request.result) tails.remove(path);
            }
        });
        return request;
    }

    @Override
    public void close() {
        workers.shutdownNow();
        timeouts.shutdownNow();
    }
}
