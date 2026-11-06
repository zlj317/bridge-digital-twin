-- =============================================================
-- 智慧桥梁数字孪生系统 · 种子数据（与效果图数值 1:1）
-- =============================================================

-- ---------- 桥梁档案 ----------
INSERT INTO brg_bridge (bridge_code, bridge_name, project_no, bridge_type, tower_height, main_span,
                        side_span, total_length, deck_width, cable_count, design_load_t, build_year,
                        design_life, maintain_level, location, manage_unit)
VALUES ('BR-DEMO-01','滨江大桥','BR-2026','CABLE_STAYED',216,480,180,840,24,72,55,2031,100,'一级',
        '示范市·滨江新区跨江段','市桥梁养护中心')
ON CONFLICT DO NOTHING;

-- ---------- 构件树：一级结构 ----------
INSERT INTO brg_component (bridge_code, comp_code, comp_name, comp_type, parent_code, sort_no, material,
                           pos_x, pos_y, pos_z, clip_exempt, model_skeleton_code, model_solid_code, model_inner_code) VALUES
('BR-DEMO-01','TOWER-L','1# 桥塔（左）','TOWER',NULL,1,'C50 混凝土',-240,0,0,true,'MDL-TOWER-SK','MDL-TOWER','MDL-TOWER-IN'),
('BR-DEMO-01','TOWER-R','2# 桥塔（右）','TOWER',NULL,2,'C50 混凝土', 240,0,0,true,'MDL-TOWER-SK','MDL-TOWER','MDL-TOWER-IN'),
('BR-DEMO-01','PIER-L','左塔桥墩','PIER','TOWER-L',1,'C40 混凝土',-240,0,0,true,'MDL-PIER-SK','MDL-PIER',NULL),
('BR-DEMO-01','PIER-R','右塔桥墩','PIER','TOWER-R',2,'C40 混凝土', 240,0,0,true,'MDL-PIER-SK','MDL-PIER',NULL),
('BR-DEMO-01','FOOTING-L','左承台','FOOTING','PIER-L',1,'C40 混凝土',-240,0,0,true,'MDL-FOOT-SK','MDL-FOOT',NULL),
('BR-DEMO-01','FOOTING-R','右承台','FOOTING','PIER-R',2,'C40 混凝土', 240,0,0,true,'MDL-FOOT-SK','MDL-FOOT',NULL),
('BR-DEMO-01','GIRDER','主梁（42 节段）','GIRDER_SEGMENT',NULL,3,'Q345qD 钢箱梁',0,58,0,false,'MDL-GIRDER-SK','MDL-GIRDER','MDL-GIRDER-IN'),
('BR-DEMO-01','INNER','箱梁内部结构','DIAPHRAGM','GIRDER',1,'Q345qD',0,54,0,true,NULL,NULL,'MDL-GIRDER-IN'),
('BR-DEMO-01','PAVEMENT','桥面铺装','PAVEMENT','GIRDER',2,'沥青混凝土',0,58,0,false,'MDL-DECK-SK','MDL-DECK',NULL),
('BR-DEMO-01','RAILING','护栏','RAILING','GIRDER',3,'Q235 钢',0,58,0,true,'MDL-RAIL-SK','MDL-RAIL',NULL),
('BR-DEMO-01','BEARINGS','支座组','BEARING','GIRDER',4,'橡胶+钢',0,56,0,true,'MDL-BEAR-SK','MDL-BEAR',NULL)
ON CONFLICT DO NOTHING;

-- ---------- 42 个箱梁节段（每 20m，跨中 B-21/B-22 为合龙段） ----------
INSERT INTO brg_girder_segment (bridge_code, segment_code, chainage, length_m, section_type, cell_count,
                                top_slab_mm, bottom_slab_mm, web_mm, weight_t, is_closure, sort_no)
SELECT 'BR-DEMO-01', 'B-' || lpad(n::text,2,'0'), -420 + (n-1)*20 + 10, 20, 'MULTI_CELL_BOX', 4,
       16, 14, 12, 320 + (n % 5) * 8, n IN (21,22), n
FROM generate_series(1,42) n
ON CONFLICT DO NOTHING;

INSERT INTO brg_component (bridge_code, comp_code, comp_name, comp_type, parent_code, sort_no, material,
                           pos_x, pos_y, pos_z, clip_exempt, model_skeleton_code, model_solid_code, model_inner_code)
SELECT 'BR-DEMO-01', 'B-' || lpad(n::text,2,'0'), '箱梁节段 B-' || lpad(n::text,2,'0'), 'GIRDER_SEGMENT',
       'GIRDER', n, 'Q345qD', -420 + (n-1)*20 + 10, 58, 0, false,
       'MDL-GIRDER-SK','MDL-GIRDER','MDL-GIRDER-IN'
FROM generate_series(1,42) n
ON CONFLICT DO NOTHING;

-- ---------- 72 根拉索（双塔 × 双索面 × 18 根） ----------
INSERT INTO brg_cable (bridge_code, cable_code, cable_no, tower_side, face,
                       anchor_top_x, anchor_top_y, anchor_top_z,
                       anchor_bottom_x, anchor_bottom_y, anchor_bottom_z,
                       design_force_mn, warn_force_mn, alarm_force_mn, tension_date)
SELECT 'BR-DEMO-01', 'C-' || lpad(g::text,2,'0'),
       ((g-1) % 18) + 1,
       CASE WHEN g <= 36 THEN 'L' ELSE 'R' END,
       CASE WHEN (g-1) % 36 < 18 THEN 'LEFT' ELSE 'RIGHT' END,
       CASE WHEN g <= 36 THEN -240 ELSE 240 END,
       150 - ((g-1) % 18) * 4.2,
       CASE WHEN (g-1) % 36 < 18 THEN -11 ELSE 11 END,
       CASE WHEN g <= 36 THEN -240 + (((g-1) % 18) + 1) * 12
            ELSE 240 - (((g-1) % 18) + 1) * 12 END,
       60, CASE WHEN (g-1) % 36 < 18 THEN -11 ELSE 11 END,
       1.280 + (((g-1) % 18) - 9) * 0.004, 1.350, 1.400, DATE '2031-06-18'
FROM generate_series(1,72) g
ON CONFLICT DO NOTHING;

INSERT INTO brg_component (bridge_code, comp_code, comp_name, comp_type, parent_code, sort_no, material, pos_x, pos_y, pos_z, clip_exempt)
SELECT 'BR-DEMO-01', 'C-' || lpad(g::text,2,'0'), '拉索 C-' || lpad(g::text,2,'0'), 'CABLE',
       CASE WHEN g <= 36 THEN 'TOWER-L' ELSE 'TOWER-R' END, g, '镀锌钢丝', 0, 100, 0, true
FROM generate_series(1,72) g
ON CONFLICT DO NOTHING;

-- ---------- 6 条车道（桥轴沿 X，桥面标高 58） ----------
INSERT INTO brg_lane (bridge_code, lane_code, lane_name, direction, lane_index, offset_m, curve_points, speed_limit) VALUES
('BR-DEMO-01','LN-UP-1','上行1车道','UP',  1,-8.75,'[[-420,58,-8.75],[-200,58,-8.75],[0,58,-8.75],[200,58,-8.75],[420,58,-8.75]]',80),
('BR-DEMO-01','LN-UP-2','上行2车道','UP',  2,-5.25,'[[-420,58,-5.25],[-200,58,-5.25],[0,58,-5.25],[200,58,-5.25],[420,58,-5.25]]',80),
('BR-DEMO-01','LN-UP-3','上行3车道','UP',  3,-1.75,'[[-420,58,-1.75],[-200,58,-1.75],[0,58,-1.75],[200,58,-1.75],[420,58,-1.75]]',80),
('BR-DEMO-01','LN-DN-1','下行1车道','DOWN',1, 1.75,'[[420,58,1.75],[200,58,1.75],[0,58,1.75],[-200,58,1.75],[-420,58,1.75]]',80),
('BR-DEMO-01','LN-DN-2','下行2车道','DOWN',2, 5.25,'[[420,58,5.25],[200,58,5.25],[0,58,5.25],[-200,58,5.25],[-420,58,5.25]]',80),
('BR-DEMO-01','LN-DN-3','下行3车道','DOWN',3, 8.75,'[[420,58,8.75],[200,58,8.75],[0,58,8.75],[-200,58,8.75],[-420,58,8.75]]',80)
ON CONFLICT DO NOTHING;

-- ---------- 视点 ----------
INSERT INTO brg_viewpoint (bridge_code, vp_code, vp_name, cam_pos, cam_target, fov, sort_no) VALUES
('BR-DEMO-01','VP-OVERVIEW','全景鸟瞰','{"x":420,"y":180,"z":520}','{"x":0,"y":58,"z":0}',40,1),
('BR-DEMO-01','VP-DECK',    '桥面平视','{"x":-380,"y":62,"z":2}', '{"x":300,"y":60,"z":0}',45,2),
('BR-DEMO-01','VP-UNDER',   '桥底剖切','{"x":60,"y":8,"z":120}',  '{"x":0,"y":52,"z":0}',40,3),
('BR-DEMO-01','VP-TOWER',   '塔柱特写','{"x":180,"y":140,"z":160}','{"x":0,"y":110,"z":0}',35,4),
('BR-DEMO-01','VP-ISO',     '等轴测',  '{"x":520,"y":300,"z":520}', '{"x":0,"y":50,"z":0}',40,5),
('BR-DEMO-01','VP-SIDE',    '桥侧远景','{"x":600,"y":120,"z":600}','{"x":0,"y":70,"z":0}',40,6)
ON CONFLICT DO NOTHING;

-- ---------- 五幕动画（相机关键帧：幕内相对毫秒 t / pos / target / fov） ----------
INSERT INTO brg_anim_stage (bridge_code, stage_code, stage_name, stage_order, start_ms, end_ms, cam_keyframes, target_comps, auto_play) VALUES
('BR-DEMO-01','ACT-1','骨架生成',1,0,4500,
 '[{"t":0,"pos":[600,120,600],"target":[0,70,0],"fov":40},{"t":4500,"pos":[420,180,520],"target":[0,70,0],"fov":40}]',
 '["FOOTING-L","FOOTING-R","PIER-L","PIER-R","TOWER-L","TOWER-R","GIRDER","CABLES"]',true),
('BR-DEMO-01','ACT-2','桥面合龙',2,4500,7500,
 '[{"t":0,"pos":[420,180,520],"target":[0,70,0],"fov":40},{"t":3000,"pos":[260,110,360],"target":[0,58,0],"fov":42}]',
 '["GIRDER","PAVEMENT","CABLES"]',true),
('BR-DEMO-01','ACT-3','车辆加载',3,7500,9500,
 '[{"t":0,"pos":[260,110,360],"target":[0,58,0],"fov":42},{"t":2000,"pos":[-380,62,2],"target":[300,60,0],"fov":45}]',
 '["PAVEMENT","VEHICLES"]',true),
('BR-DEMO-01','ACT-4','结构透视',4,9500,12500,
 '[{"t":0,"pos":[-380,62,2],"target":[300,60,0],"fov":45},{"t":1300,"pos":[-160,24,180],"target":[0,52,0],"fov":42},{"t":3000,"pos":[60,8,120],"target":[0,52,0],"fov":40}]',
 '["GIRDER","INNER","SENSORS"]',true),
('BR-DEMO-01','ACT-5','稳态巡检',5,12500,0,
 '[{"t":0,"pos":[60,8,120],"target":[0,52,0],"fov":40}]','["SENSORS"]',true)
ON CONFLICT DO NOTHING;

-- ---------- 剖切方案 ----------
INSERT INTO brg_clip_plan (bridge_code, plan_code, plan_name, normal_x, normal_y, normal_z, clip_distance,
                           show_rebar, show_diaphragm, show_stiffener, is_default)
VALUES ('BR-DEMO-01','CLIP-AXIAL','沿桥轴剖切',-1,0,0,0,true,true,true,true),
       ('BR-DEMO-01','CLIP-CROSS','横向剖切', 0,0,-1,0,true,true,true,false)
ON CONFLICT DO NOTHING;

-- ---------- 模型资源（9 个 GLB 占位，MinIO bucket: bridge-models） ----------
INSERT INTO scn_model (model_code, model_name, model_type, file_name, object_key, public_url, lod_level, poly_count, is_draco) VALUES
('MDL-TOWER','tower_lod0.glb','TOWER','tower_lod0.glb','glb/tower_lod0.glb','/models/tower_lod0.glb',0,8000,true),
('MDL-TOWER-LOD1','tower_lod1.glb','TOWER','tower_lod1.glb','glb/tower_lod1.glb','/models/tower_lod1.glb',1,2000,true),
('MDL-GIRDER','girder_shell.glb','GIRDER','girder_shell.glb','glb/girder_shell.glb','/models/girder_shell.glb',0,25000,true),
('MDL-GIRDER-IN','girder_inner.glb','INNER','girder_inner.glb','glb/girder_inner.glb','/models/girder_inner.glb',0,18000,true),
('MDL-SECTION','girder_section.glb','INNER','girder_section.glb','glb/girder_section.glb','/models/girder_section.glb',0,12000,true),
('MDL-CABLES','cables.glb','CABLE','cables.glb','glb/cables.glb','/models/cables.glb',0,6000,true),
('MDL-PIER','piers_supports.glb','PIER','piers_supports.glb','glb/piers_supports.glb','/models/piers_supports.glb',0,10000,true),
('MDL-CAR-A','car_a.glb','VEHICLE','car_a.glb','glb/car_a.glb','/models/car_a.glb',0,600,false),
('MDL-CAR-B','car_b.glb','VEHICLE','car_b.glb','glb/car_b.glb','/models/car_b.glb',0,900,false)
ON CONFLICT DO NOTHING;

-- ---------- 9 类测点字典 ----------
INSERT INTO shm_point_type (ptype_code, ptype_name, unit, decimals, color, sort_no) VALUES
('STRESS','结构应力','MPa',1,'#00E5FF',1),
('CABLE_FORCE','索力','kN',0,'#2C7BE5',2),
('DEFLECTION','挠度','m',2,'#2ED47A',3),
('FREQUENCY','振动频率','Hz',2,'#FFB444',4),
('DAMPING','阻尼比','%',1,'#7B8CFF',5),
('TEMPERATURE','温度','℃',1,'#FF8A1E',6),
('WIND_SPEED','风速','m/s',1,'#4DA3FF',7),
('BEARING_DISP','支座位移','mm',2,'#F2C14E',8),
('CRACK','裂缝宽度','mm',2,'#FF4D4F',9)
ON CONFLICT DO NOTHING;

-- ---------- 150 个测点 ----------
-- ① 72 个索力点（C-01 ~ C-72，单位 MN；C-01/C-03 阈值与图 3 表格一致）
INSERT INTO shm_point (bridge_code, comp_code, point_code, point_name, ptype_code, unit, decimals,
                       warn_min, warn_max, alarm_min, alarm_max, collect_interval, group_code, sort_no, pos_x, pos_y, pos_z)
SELECT 'BR-DEMO-01', 'C-' || lpad(n::text,2,'0'), 'PTS-C-' || lpad(n::text,2,'0'),
       'C-' || lpad(n::text,2,'0') || ' 索力', 'CABLE_FORCE', 'MN', 3,
       0, CASE WHEN n = 3 THEN 1.360 ELSE 1.350 END, 0, 1.400, 2, 'TOWER', n,
       CASE WHEN n <= 36 THEN -240 + ((n-1) % 18 + 1) * 12 ELSE 240 - ((n-1) % 18 + 1) * 12 END,
       58, CASE WHEN (n-1) % 36 < 18 THEN -11 ELSE 11 END
FROM generate_series(1,72) n
ON CONFLICT DO NOTHING;

-- ② 42 个主梁应变点
INSERT INTO shm_point (bridge_code, comp_code, point_code, point_name, ptype_code, unit, decimals,
                       warn_min, warn_max, alarm_min, alarm_max, group_code, sort_no, pos_x, pos_y, pos_z)
SELECT 'BR-DEMO-01', 'B-' || lpad(n::text,2,'0'), 'PTS-STR-' || lpad(n::text,2,'0'),
       'B-' || lpad(n::text,2,'0') || ' 应变', 'STRESS', 'MPa', 1,
       0, 55, 0, 70, 'GIRDER', 100 + n, -420 + (n-1)*20 + 10, 54, 8
FROM generate_series(1,42) n
ON CONFLICT DO NOTHING;

-- ③ 36 个环境 / 变形 / 支座 / 裂缝点
INSERT INTO shm_point (bridge_code, comp_code, point_code, point_name, ptype_code, unit, decimals,
                       warn_min, warn_max, alarm_min, alarm_max, group_code, sort_no, pos_x, pos_y, pos_z)
SELECT * FROM (
    SELECT 'BR-DEMO-01'::varchar bc, 'B-' || lpad((n*5)::text,2,'0') cc, 'PTS-DEF-' || lpad(n::text,2,'0') pc,
           '挠度 D-' || lpad(n::text,2,'0') pn, 'DEFLECTION'::varchar pt, 'm' u, 2::smallint d,
           0::float8 wmin, 1.20::float8 wmax, 0::float8 amin, 1.50::float8 amax,
           'GIRDER'::varchar gc, 200+n sn, (-420 + n*90)::float8 px, 54::float8 py, 0::float8 pz
    FROM generate_series(1,8) n
    UNION ALL
    SELECT 'BR-DEMO-01','TOWER-L','PTS-TMP-' || lpad(n::text,2,'0'),'温度 T-' || lpad(n::text,2,'0'),'TEMPERATURE','℃',1,
           -10,40,-20,50,'ENV',300+n,-240,20+n*20,0 FROM generate_series(1,6) n
    UNION ALL
    SELECT 'BR-DEMO-01','TOWER-R','PTS-WND-' || lpad(n::text,2,'0'),'风速 W-' || lpad(n::text,2,'0'),'WIND_SPEED','m/s',1,
           0,18,0,25,'ENV',320+n,240,120+n*20,0 FROM generate_series(1,4) n
    UNION ALL
    SELECT 'BR-DEMO-01','GIRDER','PTS-FRQ-' || lpad(n::text,2,'0'),'振动频率 F-' || lpad(n::text,2,'0'),'FREQUENCY','Hz',2,
           0.2,0.9,0.1,1.2,'GIRDER',340+n,-200+n*100,54,0 FROM generate_series(1,4) n
    UNION ALL
    SELECT 'BR-DEMO-01','GIRDER','PTS-DMP-' || lpad(n::text,2,'0'),'阻尼比 Z-' || lpad(n::text,2,'0'),'DAMPING','%',1,
           1.0,4.0,0.5,5.0,'GIRDER',350+n,-200+n*100,54,0 FROM generate_series(1,4) n
    UNION ALL
    SELECT 'BR-DEMO-01','BEARINGS','PTS-BRG-' || lpad(n::text,2,'0'),'支座位移 S-' || lpad(n::text,2,'0'),'BEARING_DISP','mm',2,
           0,25,0,40,'BEARING',360+n,CASE WHEN n%2=0 THEN 240 ELSE -240 END,56,0 FROM generate_series(1,6) n
    UNION ALL
    SELECT 'BR-DEMO-01','GIRDER','PTS-CRK-' || lpad(n::text,2,'0'),'裂缝宽度 K-' || lpad(n::text,2,'0'),'CRACK','mm',2,
           0,0.20,0,0.30,'GIRDER',370+n,-200+n*100,54,10 FROM generate_series(1,4) n
) t
ON CONFLICT DO NOTHING;

-- ---------- 巡检与缺陷台账 ----------
INSERT INTO shm_inspection (inspect_code, bridge_code, inspect_type, scan_progress, defect_count,
                            key_area, risk_level, next_inspect_date, inspect_date, inspector, remark)
VALUES ('INS-2026-01','BR-DEMO-01','SCAN',94.00,2,'箱梁B-03','低','2026-11-12','2026-10-12','张工',
        '箱梁 B-03 内部发现 2 处轻微涂层缺陷，建议纳入下次例行巡检')
ON CONFLICT DO NOTHING;

-- ---------- 初始告警（对应右栏「异常事件 1 起」） ----------
INSERT INTO shm_alarm (alarm_code, bridge_code, comp_code, point_code, alarm_level, title, content,
                       alarm_value, threshold_value, unit, status)
VALUES ('ALM-2026-0001','BR-DEMO-01','B-03','PTS-STR-03','WARN','箱梁 B-03 应变预警',
        '测点 PTS-STR-03 连续 3 次超过预警阈值，建议复核涂层缺陷',57.2,55,'MPa','ACTIVE')
ON CONFLICT DO NOTHING;

-- ---------- 仿真方案 ----------
INSERT INTO sim_plan (plan_code, bridge_code, plan_name, sim_type, density_pct, avg_speed, vehicle_max)
VALUES ('SIM-BRIDGE-01','BR-DEMO-01','桥梁车流与监测联合仿真','COUPLED',62,58,36),
       ('SIM-SHM-01','BR-DEMO-01','SHM 监测独立仿真','SHM',0,0,0)
ON CONFLICT DO NOTHING;

-- ---------- 系统 ----------
INSERT INTO sys_user (user_code, username, password, display_name)
VALUES ('U-001','admin','21232f297a57a5a743894a0e4a801fc3','系统管理员')
ON CONFLICT DO NOTHING;

INSERT INTO sys_config (config_key, config_value, config_group, value_type, description) VALUES
('mqtt.broker','tcp://emqx:1883','MQTT','STRING','EMQX 地址'),
('mqtt.ws.url','ws://emqx:8083/mqtt','MQTT','STRING','前端 WebSocket 地址'),
('tdengine.url','http://tdengine:6041','STORAGE','STRING','TDengine REST 地址'),
('minio.endpoint','http://minio:9000','STORAGE','STRING','MinIO 地址'),
('minio.bucket','bridge-models','STORAGE','STRING','模型桶'),
('alarm.debounce.up','3','ALARM','NUMBER','连续超限次数触发告警'),
('alarm.debounce.down','3','ALARM','NUMBER','连续正常次数自动恢复'),
('cache.realtime.ttl','300','CACHE','NUMBER','实时值 TTL（秒）'),
('cache.bootstrap.ttl','600','CACHE','NUMBER','首屏整包 TTL（秒）'),
('sim.default.density','62','SIM','NUMBER','默认车流密度'),
('sim.default.speed','58','SIM','NUMBER','默认平均车速 km/h'),
('render.bloom.enabled','true','RENDER','BOOLEAN','是否启用 Bloom')
ON CONFLICT DO NOTHING;

INSERT INTO sys_oper_log (log_code, user_code, module, action, target_code, params, result)
VALUES ('LOG-2026-0001','U-001','SYSTEM','INIT','BR-DEMO-01','{"note":"初始化种子数据"}'::jsonb,'SUCCESS')
ON CONFLICT DO NOTHING;
