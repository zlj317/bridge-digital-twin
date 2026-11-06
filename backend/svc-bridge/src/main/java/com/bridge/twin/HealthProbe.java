package com.bridge.twin;

import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.eclipse.microprofile.health.HealthCheck;
import org.eclipse.microprofile.health.HealthCheckResponse;
import org.eclipse.microprofile.health.HealthCheckResponseBuilder;
import org.eclipse.microprofile.health.Liveness;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;

/** SYS-004：/q/health 聚合 PG / Redis / TDengine / MinIO / EMQX 连通性 */
@Liveness
@ApplicationScoped
public class HealthProbe implements HealthCheck {

    @ConfigProperty(name = "bdt.pg.url")
    String pgUrl;
    @ConfigProperty(name = "bdt.redis.host")
    String redisHost;
    @ConfigProperty(name = "bdt.tdengine.url")
    String taosUrl;
    @ConfigProperty(name = "bdt.minio.endpoint")
    String minioUrl;
    @ConfigProperty(name = "bdt.mqtt.host")
    String mqttHost;
    @ConfigProperty(name = "bdt.mqtt.port")
    int mqttPort;

    @Override
    public HealthCheckResponse call() {
        HealthCheckResponseBuilder b = HealthCheckResponse.named("bridge-dependencies").up();
        String[] pg = hostPort(pgUrl.replace("jdbc:postgresql://", ""), 5432);
        String[] taos = hostPort(taosUrl.replace("http://", "").replace("https://", ""), 6041);
        String[] minio = hostPort(minioUrl.replace("http://", "").replace("https://", ""), 9000);
        b.withData("postgres", probe(pg[0], Integer.parseInt(pg[1])));
        b.withData("redis", probe(redisHost, 6379));
        b.withData("tdengine", probe(taos[0], Integer.parseInt(taos[1])));
        b.withData("minio", probe(minio[0], Integer.parseInt(minio[1])));
        b.withData("emqx", probe(mqttHost, mqttPort));
        b.withData("storage", "in-memory");
        return b.build();
    }

    private String[] hostPort(String s, int defaultPort) {
        int slash = s.indexOf('/');
        if (slash > 0) s = s.substring(0, slash);
        int colon = s.indexOf(':');
        if (colon > 0) return new String[] { s.substring(0, colon), s.substring(colon + 1) };
        return new String[] { s, String.valueOf(defaultPort) };
    }

    private String probe(String host, int port) {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(host, port), 250);
            return "UP";
        } catch (IOException | NumberFormatException e) {
            return "DOWN";
        }
    }
}
