-- =============================================================
-- 智慧桥梁数字孪生系统 · TDengine 3.3 时序模型（文档 7.7）
-- =============================================================
CREATE DATABASE IF NOT EXISTS bridge_ts KEEP 365 DURATION 10 PRECISION 'ms' REPLICA 1 VGROUPS 2;

USE bridge_ts;

CREATE STABLE IF NOT EXISTS shm_metric (
    ts      TIMESTAMP,
    val     DOUBLE,
    quality TINYINT,     -- 0 正常 / 1 可疑 / 2 异常
    source  TINYINT      -- 0 真实 / 1 仿真
) TAGS (
    bridge_code VARCHAR(64),
    comp_code   VARCHAR(64),
    point_code  VARCHAR(64),
    point_type  VARCHAR(32),
    unit        VARCHAR(16)
);

-- 图 3「内部透视」测点表的 6 个索力子表
CREATE TABLE IF NOT EXISTS d_pts_c_01 USING shm_metric TAGS ('BR-DEMO-01','C-01','PTS-C-01','CABLE_FORCE','MN');
CREATE TABLE IF NOT EXISTS d_pts_c_02 USING shm_metric TAGS ('BR-DEMO-01','C-02','PTS-C-02','CABLE_FORCE','MN');
CREATE TABLE IF NOT EXISTS d_pts_c_03 USING shm_metric TAGS ('BR-DEMO-01','C-03','PTS-C-03','CABLE_FORCE','MN');
CREATE TABLE IF NOT EXISTS d_pts_c_04 USING shm_metric TAGS ('BR-DEMO-01','C-04','PTS-C-04','CABLE_FORCE','MN');
CREATE TABLE IF NOT EXISTS d_pts_c_05 USING shm_metric TAGS ('BR-DEMO-01','C-05','PTS-C-05','CABLE_FORCE','MN');
CREATE TABLE IF NOT EXISTS d_pts_c_06 USING shm_metric TAGS ('BR-DEMO-01','C-06','PTS-C-06','CABLE_FORCE','MN');

-- 聚合指标子表（左栏 5 项）
CREATE TABLE IF NOT EXISTS d_pts_str_max  USING shm_metric TAGS ('BR-DEMO-01','GIRDER','METRIC-STRESS','STRESS','MPa');
CREATE TABLE IF NOT EXISTS d_pts_def_mid  USING shm_metric TAGS ('BR-DEMO-01','GIRDER','METRIC-DEFLECTION','DEFLECTION','m');
CREATE TABLE IF NOT EXISTS d_pts_tmp_avg  USING shm_metric TAGS ('BR-DEMO-01','GIRDER','METRIC-TEMPERATURE','TEMPERATURE','C');
CREATE TABLE IF NOT EXISTS d_pts_wnd_max  USING shm_metric TAGS ('BR-DEMO-01','GIRDER','METRIC-WIND','WIND_SPEED','m/s');
CREATE TABLE IF NOT EXISTS d_pts_frq_main USING shm_metric TAGS ('BR-DEMO-01','GIRDER','METRIC-FREQUENCY','FREQUENCY','Hz');

-- 常用查询示例（供 /history/series、/history/statistics 使用）
-- SELECT ts, val FROM shm_metric WHERE point_code='PTS-C-01' AND ts >= NOW - 1h;
-- SELECT _wstart AS ts, AVG(val) AS val FROM shm_metric
--  WHERE point_code IN ('PTS-C-01','PTS-C-02') AND ts >= '2026-11-05 00:00:00' AND ts <= '2026-11-06 00:00:00' INTERVAL(1m);
-- SELECT COUNT(*) cnt, MAX(val) mx, MIN(val) mn, AVG(val) av FROM shm_metric
--  WHERE point_code='PTS-C-01' AND ts >= '2026-11-05 00:00:00' AND ts <= '2026-11-06 00:00:00';
