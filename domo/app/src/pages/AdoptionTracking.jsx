import React, { useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import ChartPanel from "../components/ChartPanel";
import KpiCard from "../components/KpiCard";
import ReviewEvaluation from "../components/ReviewEvaluation";
import { isDomo } from "../data/domoFetch";
import { CHART_COLORS, TOOLTIP_PROPS, CHART_ANIM, fmt, groupBy, DEFINITIONS } from "../data/constants";

export default function AdoptionTracking({ engagement, config }) {
  // Unique active users
  const activeUsers = useMemo(
    () => [...new Set(engagement.map(r => r.user_email))],
    [engagement]
  );

  // Weekly users trend (group by view_date)
  const weeklyData = useMemo(() => {
    const byDate = groupBy(engagement, "view_date");
    return Object.entries(byDate)
      .map(([date, rows]) => ({
        date,
        users: [...new Set(rows.map(r => r.user_email))].length,
        sessions: rows.length,
        avgDuration: Math.round(rows.reduce((s, r) => s + Number(r.session_duration_seconds), 0) / rows.length),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [engagement]);

  // Most viewed pages
  const pageViews = useMemo(() => {
    const byPage = groupBy(engagement, "page_viewed");
    return Object.entries(byPage)
      .map(([page, rows]) => ({
        page,
        views: rows.length,
        uniqueUsers: [...new Set(rows.map(r => r.user_email))].length,
      }))
      .sort((a, b) => b.views - a.views);
  }, [engagement]);

  // Most interacted cards
  const cardViews = useMemo(() => {
    const byCard = groupBy(engagement, "card_interacted");
    return Object.entries(byCard)
      .map(([card, rows]) => ({
        card,
        interactions: rows.length,
      }))
      .sort((a, b) => b.interactions - a.interactions)
      .slice(0, 8);
  }, [engagement]);

  // Role breakdown
  const roleBreakdown = useMemo(() => {
    const byRole = groupBy(engagement, "role");
    return Object.entries(byRole).map(([role, rows]) => ({
      role: role.replace(/_/g, " "),
      sessions: rows.length,
      avgDuration: Math.round(rows.reduce((s, r) => s + Number(r.session_duration_seconds), 0) / rows.length),
    }));
  }, [engagement]);

  const dates = [...new Set(engagement.map(r => r.view_date))].sort();
  const period = dates.length ? `${dates[0]} to ${dates[dates.length - 1]}` : "No sessions";
  const totalProvisioned = config.length;
  const avgSessionDuration = engagement.length
    ? Math.round(engagement.reduce((s, r) => s + Number(r.session_duration_seconds), 0) / engagement.length)
    : 0;

  return (
    <div className="page-grid">
      {!isDomo && <div className="data-note">
        <p>These synthetic session counts illustrate activity. They do not measure whether analysts produce more complete briefs or recipients need fewer clarifications.</p>
        <ReviewEvaluation />
      </div>}
      <p className="period-label">{period}</p>
      {/* KPI Row */}
      <div className="kpi-row span-full">
        <KpiCard label="Active Users" value={activeUsers.length} sub={`of ${totalProvisioned} provisioned`} color="teal" />
        <KpiCard label="Total Sessions" value={engagement.length} sub="Displayed period" color="blue" />
        <KpiCard label="Avg Session" value={`${Math.floor(avgSessionDuration / 60)}m ${avgSessionDuration % 60}s`} sub="Per session" color="gold" />
        <KpiCard
          label="Adoption Rate"
          value={totalProvisioned > 0 ? fmt.pct0(activeUsers.length / totalProvisioned) : "\u2014"}
          sub="Active / provisioned"
          info={DEFINITIONS.adoptionRate}
          color="green"
        />
      </div>

      {/* Daily users trend */}
      <ChartPanel title="Daily users and sessions">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={weeklyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,126,140,0.15)" />
            <XAxis dataKey="date" stroke={CHART_COLORS.muted} tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={24} tickFormatter={(d) => { const p = String(d).split("-"); return p.length === 3 ? `${Number(p[1])}/${Number(p[2])}` : d; }} />
            <YAxis stroke={CHART_COLORS.muted} tick={{ fontSize: 11 }} />
            <Tooltip {...TOOLTIP_PROPS} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="users" name="Unique Users" stroke={CHART_COLORS.tealXlt} strokeWidth={2} dot={{ r: 3 }} {...CHART_ANIM} />
            <Line type="monotone" dataKey="sessions" name="Sessions" stroke={CHART_COLORS.gold} strokeWidth={2} dot={{ r: 3 }} {...CHART_ANIM} />
          </LineChart>
        </ResponsiveContainer>
      </ChartPanel>

      {/* Most viewed pages */}
      <ChartPanel title="Most viewed pages">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={pageViews} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,126,140,0.15)" />
            <XAxis type="number" stroke={CHART_COLORS.muted} tick={{ fontSize: 11 }} />
            <YAxis dataKey="page" type="category" width={140} stroke={CHART_COLORS.muted} tick={{ fontSize: 10 }} />
            <Tooltip {...TOOLTIP_PROPS} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="views" name="Views" fill={CHART_COLORS.tealXlt} radius={[0, 4, 4, 0]} {...CHART_ANIM} />
            <Bar dataKey="uniqueUsers" name="Unique Users" fill={CHART_COLORS.gold} radius={[0, 4, 4, 0]} {...CHART_ANIM} />
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>

      {/* Top card interactions */}
      <ChartPanel title="Card interactions">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={cardViews} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,126,140,0.15)" />
            <XAxis type="number" stroke={CHART_COLORS.muted} tick={{ fontSize: 11 }} />
            <YAxis dataKey="card" type="category" width={140} stroke={CHART_COLORS.muted} tick={{ fontSize: 10 }} />
            <Tooltip {...TOOLTIP_PROPS} />
            <Bar dataKey="interactions" name="Interactions" fill={CHART_COLORS.tealLt} radius={[0, 4, 4, 0]} {...CHART_ANIM} />
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>

      {/* Role engagement */}
      <ChartPanel title="Engagement by role" subtitle="Sessions vs avg duration">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={roleBreakdown} margin={{ bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,126,140,0.15)" />
            <XAxis dataKey="role" stroke={CHART_COLORS.muted} tick={{ fontSize: 10 }} interval={0} />
            <YAxis yAxisId="left" stroke={CHART_COLORS.tealXlt} tick={{ fontSize: 11 }} label={{ value: "Sessions", angle: -90, position: "insideLeft", fill: CHART_COLORS.muted, fontSize: 10 }} />
            <YAxis yAxisId="right" orientation="right" stroke={CHART_COLORS.gold} tick={{ fontSize: 11 }} tickFormatter={v => `${Math.round(v / 60)}m`} />
            <Tooltip
              formatter={(v, name) => name === "Avg Duration" ? `${Math.floor(v / 60)}m ${v % 60}s` : v}
              {...TOOLTIP_PROPS}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="left" dataKey="sessions" name="Sessions" fill={CHART_COLORS.tealXlt} radius={[4, 4, 0, 0]} {...CHART_ANIM} />
            <Bar yAxisId="right" dataKey="avgDuration" name="Avg Duration" fill={CHART_COLORS.gold} radius={[4, 4, 0, 0]} opacity={0.75} {...CHART_ANIM} />
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>
    </div>
  );
}
