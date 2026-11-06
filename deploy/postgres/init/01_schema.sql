-- =============================================================
-- 智慧桥梁数字孪生系统 · PostgreSQL 15 + PostGIS 3.3 建表脚本
-- 文档第 7 章：17 张表，SRID=0 平面米制，桥轴沿 X，跨中为原点
-- =============================================================
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
SET TIME ZONE 'UTC';

-- ---------- 7.3.1 桥梁档案 ----------
CREATE TABLE IF NOT EXISTS brg_bridge (
    id             BIGSERIAL PRIMARY KEY,
    bridge_code    VARCHAR(64)  NOT NULL,
    bridge_name    VARCHAR(128) NOT NULL,
    project_no     VARCHAR(64),
    bridge_type    VARCHAR(64)  NOT NULL DEFAULT 'CABLE_STAYED'
                   CHECK (bridge_type IN ('CABLE_STAYED','SUSPENSION','BEAM','ARCH')),
    tower_height   DOUBLE PRECISION,
    main_span      DOUBLE PRECISION,
    side_span      DOUBLE PRECISION,
    total_length   DOUBLE PRECISION,
    deck_width     DOUBLE PRECISION,
    cable_count    INT,
    design_load_t  DOUBLE PRECISION,
    build_year     INT,
    design_life    INT,
    maintain_level VARCHAR(16),
    location       VARCHAR(256),
    manage_unit    VARCHAR(128),
    origin_x       DOUBLE PRECISION NOT NULL DEFAULT 0,
    origin_y       DOUBLE PRECISION NOT NULL DEFAULT 0,
    origin_z       DOUBLE PRECISION NOT NULL DEFAULT 0,
    ext_json       JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_deleted     BOOLEAN NOT NULL DEFAULT false,
    create_time    TIMESTAMP NOT NULL DEFAULT NOW(),
    update_time    TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_brg_bridge ON brg_bridge(bridge_code) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_brg_bridge_name ON brg_bridge USING gin (bridge_name gin_trgm_ops);
COMMENT ON TABLE  brg_bridge IS '桥梁档案主表';
COMMENT ON COLUMN brg_bridge.tower_height IS '桥塔高度（米）';
COMMENT ON COLUMN brg_bridge.main_span IS '主跨（米）';
COMMENT ON COLUMN brg_bridge.deck_width IS '箱梁宽度（米）';
COMMENT ON COLUMN brg_bridge.cable_count IS '拉索总数（根）';
COMMENT ON COLUMN brg_bridge.design_load_t IS '设计荷载（吨）';

-- ---------- 7.3.2 构件树 ----------
CREATE TABLE IF NOT EXISTS brg_component (
    id                 BIGSERIAL PRIMARY KEY,
    bridge_code        VARCHAR(64)  NOT NULL,
    comp_code          VARCHAR(64)  NOT NULL,
    comp_name          VARCHAR(128) NOT NULL,
    comp_type          VARCHAR(32)  NOT NULL
                       CHECK (comp_type IN ('PILE','FOOTING','PIER','TOWER','GIRDER_SEGMENT',
                                            'DIAPHRAGM','CABLE','BEARING','JOINT','RAILING','PAVEMENT','OTHER')),
    parent_code        VARCHAR(64),
    sort_no            INT NOT NULL DEFAULT 0,
    material           VARCHAR(64),
    design_param       TEXT,
    weight_t           DOUBLE PRECISION,
    model_skeleton_code VARCHAR(64),
    model_solid_code    VARCHAR(64),
    model_inner_code    VARCHAR(64),
    pos_x              DOUBLE PRECISION NOT NULL DEFAULT 0,
    pos_y              DOUBLE PRECISION NOT NULL DEFAULT 0,
    pos_z              DOUBLE PRECISION NOT NULL DEFAULT 0,
    rot_x              DOUBLE PRECISION NOT NULL DEFAULT 0,
    rot_y              DOUBLE PRECISION NOT NULL DEFAULT 0,
    rot_z              DOUBLE PRECISION NOT NULL DEFAULT 0,
    scale_x            DOUBLE PRECISION NOT NULL DEFAULT 1,
    scale_y            DOUBLE PRECISION NOT NULL DEFAULT 1,
    scale_z            DOUBLE PRECISION NOT NULL DEFAULT 1,
    clip_exempt        BOOLEAN NOT NULL DEFAULT false,
    visible            BOOLEAN NOT NULL DEFAULT true,
    ext_json           JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_deleted         BOOLEAN NOT NULL DEFAULT false,
    create_time        TIMESTAMP NOT NULL DEFAULT NOW(),
    update_time        TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_brg_comp ON brg_component(bridge_code, comp_code) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_brg_comp_type   ON brg_component(bridge_code, comp_type, sort_no);
CREATE INDEX IF NOT EXISTS idx_brg_comp_parent ON brg_component(parent_code);
COMMENT ON TABLE  brg_component IS '桥梁构件树：支持父子层级，三套模型分绑';
COMMENT ON COLUMN brg_component.comp_type IS '桩基/承台/桥墩/桥塔/主梁节段/横隔板/拉索/支座/伸缩缝/护栏/铺装';
COMMENT ON COLUMN brg_component.clip_exempt IS 'true=剖切时不受影响（如塔、车、地面）';

-- ---------- 7.3.3 拉索 ----------
CREATE TABLE IF NOT EXISTS brg_cable (
    id              BIGSERIAL PRIMARY KEY,
    bridge_code     VARCHAR(64) NOT NULL,
    cable_code      VARCHAR(64) NOT NULL,
    cable_no        INT NOT NULL,
    tower_side      CHAR(1) NOT NULL CHECK (tower_side IN ('L','R')),
    face            VARCHAR(8) NOT NULL CHECK (face IN ('LEFT','RIGHT')),
    anchor_top_x    DOUBLE PRECISION,
    anchor_top_y    DOUBLE PRECISION,
    anchor_top_z    DOUBLE PRECISION,
    anchor_bottom_x DOUBLE PRECISION,
    anchor_bottom_y DOUBLE PRECISION,
    anchor_bottom_z DOUBLE PRECISION,
    design_force_mn DOUBLE PRECISION,
    warn_force_mn   DOUBLE PRECISION,
    alarm_force_mn  DOUBLE PRECISION,
    tension_date    DATE,
    is_deleted      BOOLEAN NOT NULL DEFAULT false,
    create_time     TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_brg_cable ON brg_cable(bridge_code, cable_code) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_brg_cable_tower ON brg_cable(bridge_code, tower_side, face, cable_no);
COMMENT ON TABLE  brg_cable IS '拉索专项台账：72根，双塔双索面';
COMMENT ON COLUMN brg_cable.tower_side IS '所属塔：L左塔 / R右塔';
COMMENT ON COLUMN brg_cable.face IS '索面：LEFT/RIGHT';
COMMENT ON COLUMN brg_cable.design_force_mn IS '设计索力（MN）';

-- ---------- 7.3.4 箱梁节段 ----------
CREATE TABLE IF NOT EXISTS brg_girder_segment (
    id             BIGSERIAL PRIMARY KEY,
    bridge_code    VARCHAR(64) NOT NULL,
    segment_code   VARCHAR(64) NOT NULL,
    chainage       DOUBLE PRECISION,
    length_m       DOUBLE PRECISION DEFAULT 20,
    section_type   VARCHAR(32) DEFAULT 'MULTI_CELL_BOX',
    cell_count     INT DEFAULT 4,
    top_slab_mm    DOUBLE PRECISION,
    bottom_slab_mm DOUBLE PRECISION,
    web_mm         DOUBLE PRECISION,
    weight_t       DOUBLE PRECISION,
    is_closure     BOOLEAN DEFAULT false,
    sort_no        INT DEFAULT 0,
    create_time    TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_brg_segment ON brg_girder_segment(bridge_code, segment_code);
COMMENT ON TABLE brg_girder_segment IS '箱梁节段：42个，每20m一节，含合龙段';
COMMENT ON COLUMN brg_girder_segment.cell_count IS '箱室数量，图3断口为4室';

-- ---------- 7.3.5 车道路径 ----------
CREATE TABLE IF NOT EXISTS brg_lane (
    id          BIGSERIAL PRIMARY KEY,
    bridge_code VARCHAR(64) NOT NULL,
    lane_code   VARCHAR(64) NOT NULL,
    lane_name   VARCHAR(64) NOT NULL,
    direction   VARCHAR(16) NOT NULL CHECK (direction IN ('UP','DOWN')),
    lane_index  INT NOT NULL,
    offset_m    DOUBLE PRECISION NOT NULL,
    curve_points JSONB NOT NULL,
    speed_limit DOUBLE PRECISION DEFAULT 80,
    is_deleted  BOOLEAN DEFAULT false,
    create_time TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_brg_lane ON brg_lane(bridge_code, lane_code) WHERE is_deleted = false;
COMMENT ON TABLE brg_lane IS '车道路径：6条（上下行各3），存样条控制点';
COMMENT ON COLUMN brg_lane.curve_points IS 'CatmullRomCurve3 控制点数组，单位米';

-- ---------- 7.3.6 预设视点 ----------
CREATE TABLE IF NOT EXISTS brg_viewpoint (
    id          BIGSERIAL PRIMARY KEY,
    bridge_code VARCHAR(64) NOT NULL,
    vp_code     VARCHAR(64) NOT NULL,
    vp_name     VARCHAR(64) NOT NULL,
    cam_pos     JSONB NOT NULL,
    cam_target  JSONB NOT NULL,
    fov         DOUBLE PRECISION DEFAULT 40,
    sort_no     INT DEFAULT 0,
    is_deleted  BOOLEAN DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_brg_vp ON brg_viewpoint(bridge_code, vp_code) WHERE is_deleted = false;
COMMENT ON TABLE brg_viewpoint IS '预设视点：全景/桥面/桥底剖切/塔柱特写';

-- ---------- 7.3.7 五幕动画配置 ----------
CREATE TABLE IF NOT EXISTS brg_anim_stage (
    id           BIGSERIAL PRIMARY KEY,
    bridge_code  VARCHAR(64) NOT NULL,
    stage_code   VARCHAR(64) NOT NULL,
    stage_name   VARCHAR(64) NOT NULL,
    stage_order  INT NOT NULL,
    start_ms     INT NOT NULL,
    end_ms       INT NOT NULL,
    cam_keyframes JSONB,
    target_comps  JSONB,
    auto_play    BOOLEAN DEFAULT true,
    ext_json     JSONB DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_brg_stage ON brg_anim_stage(bridge_code, stage_code);
COMMENT ON TABLE brg_anim_stage IS '五幕动画配置：骨架生成/桥面合龙/车辆加载/结构透视/稳态巡检';
COMMENT ON COLUMN brg_anim_stage.cam_keyframes IS '相机关键帧，t 为幕内相对毫秒';

-- ---------- 7.3.8 剖切方案 ----------
CREATE TABLE IF NOT EXISTS brg_clip_plan (
    id             BIGSERIAL PRIMARY KEY,
    bridge_code    VARCHAR(64) NOT NULL,
    plan_code      VARCHAR(64) NOT NULL,
    plan_name      VARCHAR(64) NOT NULL,
    normal_x       DOUBLE PRECISION NOT NULL DEFAULT -1,
    normal_y       DOUBLE PRECISION NOT NULL DEFAULT 0,
    normal_z       DOUBLE PRECISION NOT NULL DEFAULT 0,
    clip_distance  DOUBLE PRECISION NOT NULL DEFAULT 0,
    show_rebar     BOOLEAN DEFAULT true,
    show_diaphragm BOOLEAN DEFAULT true,
    show_stiffener BOOLEAN DEFAULT true,
    edge_color     VARCHAR(16) DEFAULT '#00E5FF',
    is_default     BOOLEAN DEFAULT false,
    is_deleted     BOOLEAN DEFAULT false,
    create_time    TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_brg_clip ON brg_clip_plan(bridge_code, plan_code) WHERE is_deleted = false;
COMMENT ON TABLE brg_clip_plan IS '剖切方案：法向+距离+内部件显隐';
COMMENT ON COLUMN brg_clip_plan.clip_distance IS 'Plane.constant，沿法向的裁剪距离';

-- ---------- 7.3.9 模型资源 ----------
CREATE TABLE IF NOT EXISTS scn_model (
    id          BIGSERIAL PRIMARY KEY,
    model_code  VARCHAR(64) NOT NULL,
    model_name  VARCHAR(128) NOT NULL,
    model_type  VARCHAR(32) NOT NULL DEFAULT 'PART'
                CHECK (model_type IN ('TOWER','GIRDER','INNER','CABLE','PIER','VEHICLE','OTHER')),
    file_name   VARCHAR(256) NOT NULL,
    bucket_name VARCHAR(128) NOT NULL DEFAULT 'bridge-models',
    object_key  VARCHAR(512) NOT NULL,
    public_url  TEXT,
    file_size   BIGINT DEFAULT 0,
    md5         VARCHAR(64),
    is_draco    BOOLEAN DEFAULT false,
    lod_level   SMALLINT DEFAULT 0,
    lod_group   VARCHAR(64),
    poly_count  INT,
    thumbnail_url TEXT,
    is_deleted  BOOLEAN DEFAULT false,
    create_time TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_scn_model_code ON scn_model(model_code) WHERE is_deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS uk_scn_model_md5 ON scn_model(md5) WHERE is_deleted = false AND md5 IS NOT NULL;
COMMENT ON TABLE scn_model IS 'GLB模型资源，存于MinIO，按 LOD 分组复用';

-- ---------- 7.4.1 测点类型字典 ----------
CREATE TABLE IF NOT EXISTS shm_point_type (
    id          BIGSERIAL PRIMARY KEY,
    ptype_code  VARCHAR(32) NOT NULL,
    ptype_name  VARCHAR(64) NOT NULL,
    unit        VARCHAR(16),
    data_type   VARCHAR(16) DEFAULT 'NUMERIC' CHECK (data_type IN ('NUMERIC','BOOLEAN')),
    decimals    SMALLINT DEFAULT 2,
    can_alarm   BOOLEAN DEFAULT true,
    color       VARCHAR(16) DEFAULT '#FF8A1E',
    sort_no     INT DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_shm_ptype ON shm_point_type(ptype_code);
COMMENT ON TABLE shm_point_type IS '测点类型字典：应力/索力/挠度/频率/阻尼/温度/风速/位移/裂缝';

-- ---------- 7.4.2 测点 ----------
CREATE TABLE IF NOT EXISTS shm_point (
    id            BIGSERIAL PRIMARY KEY,
    bridge_code   VARCHAR(64) NOT NULL,
    comp_code     VARCHAR(64) NOT NULL,
    point_code    VARCHAR(64) NOT NULL,
    point_name    VARCHAR(128) NOT NULL,
    ptype_code    VARCHAR(32) NOT NULL,
    unit          VARCHAR(16),
    decimals      SMALLINT DEFAULT 2,
    warn_min      DOUBLE PRECISION,
    warn_max      DOUBLE PRECISION,
    alarm_min     DOUBLE PRECISION,
    alarm_max     DOUBLE PRECISION,
    collect_interval INT DEFAULT 2,
    debounce_up   INT DEFAULT 3,
    debounce_down INT DEFAULT 3,
    pos_x         DOUBLE PRECISION DEFAULT 0,
    pos_y         DOUBLE PRECISION DEFAULT 0,
    pos_z         DOUBLE PRECISION DEFAULT 0,
    show_in_3d    BOOLEAN DEFAULT true,
    group_code    VARCHAR(32) DEFAULT 'GIRDER' CHECK (group_code IN ('TOWER','GIRDER','BEARING','ENV')),
    sort_no       INT DEFAULT 0,
    is_enabled    BOOLEAN DEFAULT true,
    is_deleted    BOOLEAN DEFAULT false,
    create_time   TIMESTAMP NOT NULL DEFAULT NOW(),
    update_time   TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_shm_point ON shm_point(point_code) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_shm_point_bridge ON shm_point(bridge_code, group_code, sort_no);
CREATE INDEX IF NOT EXISTS idx_shm_point_comp   ON shm_point(comp_code);
COMMENT ON TABLE  shm_point IS 'SHM测点：绑定构件，带预警/告警双阈值';
COMMENT ON COLUMN shm_point.group_code IS '分组：塔/梁/支座/环境';
COMMENT ON COLUMN shm_point.show_in_3d IS '是否在3D中显示橙色传感器点';

-- ---------- 7.4.3 告警事件 ----------
CREATE TABLE IF NOT EXISTS shm_alarm (
    id             BIGSERIAL PRIMARY KEY,
    alarm_code     VARCHAR(64) NOT NULL,
    bridge_code    VARCHAR(64) NOT NULL,
    comp_code      VARCHAR(64),
    point_code     VARCHAR(64),
    alarm_level    VARCHAR(16) NOT NULL CHECK (alarm_level IN ('WARN','ALARM','SERIOUS')),
    title          VARCHAR(256) NOT NULL,
    content        TEXT,
    alarm_value    DOUBLE PRECISION,
    threshold_value DOUBLE PRECISION,
    unit           VARCHAR(16),
    status         VARCHAR(16) NOT NULL DEFAULT 'ACTIVE'
                   CHECK (status IN ('ACTIVE','CONFIRMED','IGNORED','RECOVERED')),
    trigger_time   TIMESTAMP NOT NULL DEFAULT NOW(),
    recover_time   TIMESTAMP,
    confirm_user   VARCHAR(64),
    confirm_time   TIMESTAMP,
    remark         VARCHAR(512),
    ext_json       JSONB DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_shm_alarm_code ON shm_alarm(alarm_code);
CREATE INDEX IF NOT EXISTS idx_shm_alarm_time   ON shm_alarm(bridge_code, trigger_time DESC);
CREATE INDEX IF NOT EXISTS idx_shm_alarm_status ON shm_alarm(bridge_code, status, alarm_level);
CREATE INDEX IF NOT EXISTS idx_shm_alarm_point  ON shm_alarm(point_code, status);
COMMENT ON TABLE shm_alarm IS '告警事件，前端按 alarm_code 去重';

-- ---------- 7.4.4 巡检与缺陷台账 ----------
CREATE TABLE IF NOT EXISTS shm_inspection (
    id            BIGSERIAL PRIMARY KEY,
    bridge_code   VARCHAR(64) NOT NULL,
    inspect_code  VARCHAR(64) NOT NULL,
    inspect_type  VARCHAR(32) CHECK (inspect_type IN ('ROUTINE','SPECIAL','SCAN')),
    scan_progress NUMERIC(5,2),
    defect_count  INT DEFAULT 0,
    key_area      VARCHAR(128),
    risk_level    VARCHAR(16),
    next_inspect_date DATE,
    inspect_date  DATE,
    inspector     VARCHAR(64),
    remark        TEXT,
    create_time   TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_shm_inspect ON shm_inspection(inspect_code);
COMMENT ON TABLE shm_inspection IS '巡检记录与缺陷汇总（右栏「检测与预警」数据源）';

-- ---------- 7.5 仿真方案 ----------
CREATE TABLE IF NOT EXISTS sim_plan (
    id           BIGSERIAL PRIMARY KEY,
    bridge_code  VARCHAR(64) NOT NULL,
    plan_code    VARCHAR(64) NOT NULL,
    plan_name    VARCHAR(128) NOT NULL,
    sim_type     VARCHAR(32) NOT NULL CHECK (sim_type IN ('TRAFFIC','SHM','COUPLED')),
    density_pct  INT DEFAULT 62,
    avg_speed    DOUBLE PRECISION DEFAULT 58,
    vehicle_max  INT DEFAULT 36,
    duration_s   INT DEFAULT 600,
    status       VARCHAR(16) DEFAULT 'IDLE' CHECK (status IN ('IDLE','RUNNING','STOPPED','FINISHED')),
    ext_json     JSONB DEFAULT '{}'::jsonb,
    is_deleted   BOOLEAN DEFAULT false,
    create_time  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_sim_plan ON sim_plan(plan_code) WHERE is_deleted = false;
COMMENT ON TABLE sim_plan IS '仿真方案：车流密度62%、平均车速58km/h、在途36辆';
COMMENT ON COLUMN sim_plan.density_pct IS '车流密度百分比，对应底部滑块';
COMMENT ON COLUMN sim_plan.avg_speed IS '平均车速 km/h';
COMMENT ON COLUMN sim_plan.vehicle_max IS '在途车辆上限';

-- ---------- 7.5 用户 ----------
CREATE TABLE IF NOT EXISTS sys_user (
    id           BIGSERIAL PRIMARY KEY,
    user_code    VARCHAR(64) NOT NULL,
    username     VARCHAR(64) NOT NULL,
    password     VARCHAR(128) NOT NULL,
    display_name VARCHAR(64),
    status       VARCHAR(16) DEFAULT 'ENABLED' CHECK (status IN ('ENABLED','DISABLED')),
    last_login_time TIMESTAMP,
    create_time  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_sys_user ON sys_user(username);

-- ---------- 7.5 系统配置 ----------
CREATE TABLE IF NOT EXISTS sys_config (
    id           BIGSERIAL PRIMARY KEY,
    config_key   VARCHAR(128) NOT NULL,
    config_value VARCHAR(512) NOT NULL,
    config_group VARCHAR(64) DEFAULT 'DEFAULT',
    value_type   VARCHAR(16) DEFAULT 'STRING' CHECK (value_type IN ('STRING','NUMBER','BOOLEAN','JSON')),
    description  VARCHAR(256),
    editable     BOOLEAN DEFAULT true,
    update_time  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_sys_config ON sys_config(config_key);

-- ---------- 7.5 操作日志 ----------
CREATE TABLE IF NOT EXISTS sys_oper_log (
    id          BIGSERIAL PRIMARY KEY,
    log_code    VARCHAR(64) NOT NULL,
    user_code   VARCHAR(64),
    module      VARCHAR(64) NOT NULL,
    action      VARCHAR(64) NOT NULL,
    target_code VARCHAR(128),
    params      JSONB,
    result      VARCHAR(16) DEFAULT 'SUCCESS' CHECK (result IN ('SUCCESS','FAIL')),
    error_msg   TEXT,
    client_ip   VARCHAR(64),
    cost_ms     BIGINT,
    oper_time   TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_sys_oper_log ON sys_oper_log(log_code);
CREATE INDEX IF NOT EXISTS idx_sys_oper_log_time ON sys_oper_log(oper_time DESC);
