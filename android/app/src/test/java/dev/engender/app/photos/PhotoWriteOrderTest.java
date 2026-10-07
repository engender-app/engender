package dev.engender.app.photos;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.assertThrows;

import org.junit.Test;

import java.io.IOException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

public class PhotoWriteOrderTest {
    @Test
    public void delayedOldWriteCannotOverwriteRetryOrRestore() throws Exception {
        try (PhotoWriteOrder order = new PhotoWriteOrder()) {
            AtomicReference<byte[]> stored = new AtomicReference<>();
            CountDownLatch started = new CountDownLatch(1);
            CountDownLatch release = new CountDownLatch(1);
            PhotoWriteOrder.Request old = order.reserve("photo", bytes -> {
                started.countDown();
                try {
                    if (!release.await(2, TimeUnit.SECONDS)) throw new IOException("test writer timed out");
                } catch (InterruptedException error) { throw new IOException(error); }
                stored.set(bytes);
            });
            old.accept(new byte[] { 1 });
            assertTrue(started.await(2, TimeUnit.SECONDS));
            PhotoWriteOrder.Request retry = order.reserve("photo", stored::set);
            retry.accept(new byte[] { 1 });
            PhotoWriteOrder.Request restore = order.reserve("photo", stored::set);
            restore.accept(new byte[] { 2 });
            assertFalse(retry.result.isDone());
            assertFalse(restore.result.isDone());
            release.countDown();
            restore.result.get(2, TimeUnit.SECONDS);
            assertArrayEquals(new byte[] { 2 }, stored.get());
        }
    }

    @Test
    public void headerReservationPrecedesPayloadAndOtherFilesDoNotStarve() throws Exception {
        try (PhotoWriteOrder order = new PhotoWriteOrder()) {
            PhotoWriteOrder.Request first = order.reserve("photo", bytes -> {});
            PhotoWriteOrder.Request[] queued = new PhotoWriteOrder.Request[20];
            for (int i = 0; i < queued.length; i++) {
                queued[i] = order.reserve("photo", bytes -> {});
                queued[i].accept(new byte[] { 2 });
            }
            PhotoWriteOrder.Request other = order.reserve("other", bytes -> {});
            other.accept(new byte[] { 3 });
            other.result.get(2, TimeUnit.SECONDS);
            assertFalse(queued[0].result.isDone());
            first.accept(new byte[] { 1 });
            queued[19].result.get(2, TimeUnit.SECONDS);
        }
    }

    @Test
    public void abandonedHeaderTimesOutAndLatePayloadCannotWrite() throws Exception {
        try (PhotoWriteOrder order = new PhotoWriteOrder()) {
            AtomicReference<byte[]> stored = new AtomicReference<>();
            PhotoWriteOrder.Request abandoned = order.reserve("photo", stored::set, 20);
            PhotoWriteOrder.Request next = order.reserve("photo", stored::set);
            next.accept(new byte[] { 2 });
            assertThrows(ExecutionException.class, () -> abandoned.result.get(2, TimeUnit.SECONDS));
            next.result.get(2, TimeUnit.SECONDS);
            abandoned.accept(new byte[] { 1 });
            assertArrayEquals(new byte[] { 2 }, stored.get());
        }
    }

    @Test
    public void failedWriteReleasesNextReservation() throws Exception {
        try (PhotoWriteOrder order = new PhotoWriteOrder()) {
            PhotoWriteOrder.Request failed = order.reserve("photo", bytes -> { throw new IOException("disk full"); });
            PhotoWriteOrder.Request next = order.reserve("photo", bytes -> {});
            next.accept(new byte[] { 2 });
            failed.accept(new byte[] { 1 });
            assertThrows(ExecutionException.class, () -> failed.result.get(2, TimeUnit.SECONDS));
            next.result.get(2, TimeUnit.SECONDS);
        }
    }
}
