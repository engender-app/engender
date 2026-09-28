package dev.engender.app;

import static org.junit.Assert.fail;

import java.net.DatagramSocket;
import java.net.ServerSocket;

import org.junit.Test;

public class LanPermissionProbeTest {
    @Test
    public void appCanOpenTcpListener() throws Exception {
        try (ServerSocket socket = new ServerSocket(0)) {
            System.out.println("TCP listener bound: " + socket.getLocalPort());
        } catch (Exception error) {
            fail("TCP listener failed: " + error);
        }
    }

    @Test
    public void appCanOpenUdpSocket() throws Exception {
        try (DatagramSocket socket = new DatagramSocket(0)) {
            System.out.println("UDP socket bound: " + socket.getLocalPort());
        } catch (Exception error) {
            fail("UDP socket failed: " + error);
        }
    }
}
