-- ============================================================================
-- 智慧桥梁数字孪生系统  TDengine 3.3 时序库脚本
-- 执行：taos -h <host> < 03_taos_schema.sql
-- 子表按测点自动创建（服务运行期），命名 d_{point_code 小写，- 换 _}
-- ============================================================================

CREATE DATABASE IF NOT EXISTS bridge_ts
    KEEP 365
    DURATION 10
    PRECISION 'ms'
    REPLICA 1
    VGROUPS 2;

USE bridge_ts;

-- 超级表：一个测点一张子表
CREATE STABLE IF NOT EXISTS shm_metric (
    ts      TIMESTAMP,     -- 采集时间
    val     DOUBLE,        -- 测点值
    quality TINYINT,       -- 0正常 1可疑 2异常
    source  TINYINT        -- 0真实 1仿真
) TAGS (
    bridge_code VARCHAR(64),
    comp_code   VARCHAR(64),
    point_code  VARCHAR(64),
    point_type  VARCHAR(32),
    unit        VARCHAR(16)
);

COMMENT ON STABLE shm_metric IS '桥梁SHM监测时序超级表';

-- 示范子表
CREATE TABLE IF NOT EXISTS d_pts_c_01 USING shm_metric
    TAGS ('BR-DEMO-01','C-01','PTS-C-01','CABLE_FORCE','kN');

-- ---------------------------------------------------------------------------
-- 查询模板（供开发复制，不执行）
-- ---------------------------------------------------------------------------
-- ① 索力近 1 小时原始值
-- SELECT ts, val FROM shm_metric
--  WHERE point_code='PTS-C-01' AND ts >= NOW - 1h;

-- ② 1 分钟降采样（回放曲线）
-- SELECT _wstart AS ts, AVG(val) AS val FROM shm_metric
--  WHERE point_code IN ('PTS-C-01','PTS-C-02')
--    AND ts >= '2026-11-05 00:00:00' AND ts <= '2026-11-06 00:00:00'
--  INTERVAL(1m);

-- ③ 区间统计
-- SELECT COUNT(*) cnt, MAX(val) mx, MIN(val) mn, AVG(val) av FROM shm_metric
--  WHERE point_code='PTS-C-01'
--    AND ts >= '2026-11-05 00:00:00' AND ts <= '2026-11-06 00:00:00';

-- ④ 某时刻全桥快照（回放首帧对齐）
-- SELECT point_code, LAST(val) AS val, LAST(ts) AS ts FROM shm_metric
--  WHERE ts >= '2026-11-06 10:00:00' AND ts <= '2026-11-06 10:00:30'
--  PARTITION BY point_code;
-- （注：内容由AI生成）
