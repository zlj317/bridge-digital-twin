package com.bridge.twin;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.runtime.ShutdownEvent;
import io.quarkus.runtime.StartupEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.eclipse.paho.client.mqttv3.IMqttDeliveryToken;
import org.eclipse.paho.client.mqttv3.MqttCallback;
import org.eclipse.paho.client.mqttv3.MqttClient;
import org.eclipse.paho.client.mqttv3.MqttConnectOptions;
import org.eclipse.paho.client.mqttv3.MqttMessage;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * 文档 6.4 链路 A/B：订阅 sensor/raw/bridge/+ 与 traffic/vehicle/+，
 * 清洗后每 2s 发布 realtime/bridge/{code}、告警与恢复事件。
 * Broker 不可达时自动降级为本地快照定时器，服务与 REST 仍完全可用。
 */
@ApplicationScoped
public class MqttGateway {
    private static final Logger LOG = Logger.getLogger(MqttGateway.class.getName());
    private final ObjectMapper mapper = new ObjectMapper();

    @Inject
    RuntimeState state;

    @ConfigProperty(name = "bdt.mqtt.enabled")
    boolean enabled;
    @ConfigProperty(name = "bdt.mqtt.host")
    String host;
    @ConfigProperty(name = "bdt.mqtt.port")
    int port;
    @ConfigProperty(name = "bdt.alarm.debounce.up")
    int debounceUp;
    @ConfigProperty(name = "bdt.alarm.debounce.down")
    int debounceDown;
    @ConfigProperty(name = "bdt.snapshot.interval.ms")
    long intervalMs;

    private MqttClient client;
    private ScheduledExecutorService executor;

    void onStart(@Observes StartupEvent ev) {
        state.configure(debounceUp, debounceDown, this::publish);
        executor = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "bdt-shm-tick");
            t.setDaemon(true);
            return t;
        });
        executor.scheduleAtFixedRate(this::tick, 1000, Math.max(500, intervalMs), TimeUnit.MILLISECONDS);
        connect();
    }

    void onStop(@Observes ShutdownEvent ev) {
        executor.shutdownNow();
        try { if (client != null) client.disconnect(); } catch (Exception ignored) { }
    }

    private void tick() {
        try {
            state.tickLocalSimulation();
            state.snapshot();
        } catch (Exception e) {
            LOG.log(Level.WARNING, "快照生成失败", e);
        }
    }

    private void connect() {
        if (!enabled) return;
        try {
            client = new MqttClient("tcp://" + host + ":" + port,
                    "svc-shm-" + System.currentTimeMillis(), new MemoryPersistence());
            MqttConnectOptions options = new MqttConnectOptions();
            options.setCleanSession(true);
            options.setAutomaticReconnect(true);
            options.setConnectionTimeout(10);
            options.setKeepAliveInterval(30);
            client.setCallback(new MqttCallback() {
                @Override public void connectionLost(Throwable cause) {
                    LOG.warning("MQTT 连接断开，等待自动重连: " + cause.getMessage());
                }
                @Override public void deliveryComplete(IMqttDeliveryToken token) { }
                @Override public void messageArrived(String topic, MqttMessage message) {
                    onMessage(topic, new String(message.getPayload(), StandardCharsets.UTF_8));
                }
            });
            client.connect(options);
            client.subscribe("sensor/raw/bridge/+", 1);
            client.subscribe("traffic/vehicle/+", 0);
            client.subscribe("sim/bridge/command", 1);
            client.subscribe("anim/bridge/command", 0);
            LOG.info("EMQX 已连接: " + host + ":" + port);
        } catch (Exception e) {
            LOG.warning("MQTT 不可用，已降级为本地快照: " + e.getMessage());
            client = null;
        }
    }

    @SuppressWarnings("unchecked")
    private void onMessage(String topic, String payload) {
        try {
            Map<String, Object> msg = mapper.readValue(payload, Map.class);
            if (topic.startsWith("sensor/raw/bridge/")) {
                Object ts = msg.get("ts");
                List<Map<String, Object>> points = (List<Map<String, Object>>) msg.getOrDefault("points", List.of());
                List<Map<String, Object>> batch = new ArrayList<>();
                for (Map<String, Object> p : points) {
                    Map<String, Object> s = new java.util.LinkedHashMap<>(p);
                    if (ts != null) s.put("ts", ts);
                    batch.add(s);
                }
                state.ingest(batch);
            } else if (topic.startsWith("traffic/vehicle/")) {
                Object stat = msg.get("stat");
                if (stat instanceof Map<?, ?> m) {
                    Map<String, Object> copy = new java.util.LinkedHashMap<>();
                    m.forEach((k, v) -> copy.put(String.valueOf(k), v));
                    state.setTrafficStat(copy);
                }
            } else if (topic.endsWith("sim/bridge/command")) {
                String action = String.valueOf(msg.getOrDefault("action", ""));
                if ("INJECT_OVERLIMIT".equals(action)) state.injectOverlimit();
                else if ("SET_DENSITY".equals(action) && msg.get("densityPct") instanceof Number n) {
                    Map<String, Object> stat = new java.util.LinkedHashMap<>(state.trafficStat());
                    stat.put("vehicleCount", Math.round(n.doubleValue() * 1.16));
                    state.setTrafficStat(stat);
                }
            }
        } catch (Exception e) {
            LOG.warning("报文解析失败: " + e.getMessage());
        }
    }

    private void publish(String topic, Object payload) {
        if (client == null || !client.isConnected()) return;
        try {
            byte[] bytes = mapper.writeValueAsBytes(payload);
            MqttMessage message = new MqttMessage(bytes);
            message.setQos(1);
            client.publish(topic, message);
        } catch (Exception e) {
            LOG.warning("MQTT 发布失败: " + e.getMessage());
        }
    }
}
