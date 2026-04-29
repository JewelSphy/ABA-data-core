package gilberto.handlers;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import gilberto.Audit;
import gilberto.Db;
import gilberto.HttpUtil;
import gilberto.QueryUtil;
import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.Map;

public final class StatsHandler {

  public static final class ClientStatsHandler implements HttpHandler {
    @Override
    public void handle ( HttpExchange ex ) throws IOException {
      if ( HttpUtil.preflight ( ex ) ) return;
      if ( !HttpUtil.requireApiKey ( ex ) ) { Audit.log ( ex, "auth_failed", "client_stats", null, "denied" ); return; }
      Map<String, String> q = HttpUtil.queryParams ( ex );
      String orgId = QueryUtil.eq ( q, "org_id" );
      if ( orgId == null || orgId.isBlank () ) { HttpUtil.err ( ex, 400, "org_id is required" ); return; }

      try ( Connection c = Db.open () ) {
        long active = count ( c, "SELECT COUNT(*) FROM clients WHERE org_id = ? AND status = 'active'", orgId );
        long inactive = count ( c, "SELECT COUNT(*) FROM clients WHERE org_id = ? AND status = 'inactive'", orgId );
        long discharged = count ( c, "SELECT COUNT(*) FROM clients WHERE org_id = ? AND status = 'discharged'", orgId );
        HttpUtil.json ( ex, 200, "{"
            + "\"active\":" + active + ","
            + "\"inactive\":" + inactive + ","
            + "\"discharged\":" + discharged + ","
            + "\"total\":" + ( active + inactive + discharged )
            + "}" );
      } catch ( Exception e ) {
        HttpUtil.err ( ex, 500, "Failed to load client stats" );
      }
    }
  }

  public static final class DashboardStatsHandler implements HttpHandler {
    @Override
    public void handle ( HttpExchange ex ) throws IOException {
      if ( HttpUtil.preflight ( ex ) ) return;
      if ( !HttpUtil.requireApiKey ( ex ) ) { Audit.log ( ex, "auth_failed", "dashboard_stats", null, "denied" ); return; }
      Map<String, String> q = HttpUtil.queryParams ( ex );
      String orgId = QueryUtil.eq ( q, "org_id" );
      String today = q.get ( "today" );
      String weekStart = q.get ( "week_start" );
      String weekEnd = q.get ( "week_end" );
      if ( orgId == null || orgId.isBlank () ) { HttpUtil.err ( ex, 400, "org_id is required" ); return; }

      try ( Connection c = Db.open () ) {
        long activeClients = count ( c, "SELECT COUNT(*) FROM clients WHERE org_id = ? AND status = 'active'", orgId );
        long sessionsToday = ( today == null || today.isBlank () ) ? 0 : count2 ( c, "SELECT COUNT(*) FROM sessions WHERE org_id = ? AND session_date = ?", orgId, today );
        long pendingRevisions = count ( c, "SELECT COUNT(*) FROM sessions WHERE org_id = ? AND status = 'pending_review'", orgId );
        long sessionsWeek = ( weekStart == null || weekEnd == null || weekStart.isBlank () || weekEnd.isBlank () )
            ? 0
            : count3 ( c, "SELECT COUNT(*) FROM sessions WHERE org_id = ? AND session_date >= ? AND session_date <= ?", orgId, weekStart, weekEnd );
        long missingClientDocs = count ( c,
            "SELECT COUNT(*) FROM documents WHERE org_id = ? AND client_id IS NOT NULL AND requirement_key IS NOT NULL AND status = 'missing'",
            orgId );
        long docsReqExpired = count ( c,
            "SELECT COUNT(*) FROM documents WHERE org_id = ? AND client_id IS NOT NULL AND requirement_key IS NOT NULL"
            + " AND ((expiry_date IS NOT NULL AND expiry_date < CURDATE()) OR LOWER(COALESCE(status,'')) = 'expired')",
            orgId );
        long docsReqExpiringSoon = count ( c,
            "SELECT COUNT(*) FROM documents WHERE org_id = ? AND client_id IS NOT NULL AND requirement_key IS NOT NULL"
            + " AND expiry_date IS NOT NULL AND expiry_date >= CURDATE()"
            + " AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL 45 DAY)"
            + " AND LOWER(COALESCE(status,'')) <> 'missing'",
            orgId );
        HttpUtil.json ( ex, 200, "{"
            + "\"active_clients\":" + activeClients + ","
            + "\"sessions_today\":" + sessionsToday + ","
            + "\"pending_revisions\":" + pendingRevisions + ","
            + "\"sessions_week\":" + sessionsWeek + ","
            + "\"missing_client_documents\":" + missingClientDocs + ","
            + "\"documents_required_expired\":" + docsReqExpired + ","
            + "\"documents_required_expiring_soon\":" + docsReqExpiringSoon
            + "}" );
      } catch ( Exception e ) {
        HttpUtil.err ( ex, 500, "Failed to load dashboard stats" );
      }
    }
  }

  private static long count ( Connection c, String sql, String a ) throws Exception {
    try ( PreparedStatement ps = c.prepareStatement ( sql ) ) {
      ps.setString ( 1, a );
      try ( ResultSet rs = ps.executeQuery () ) { return rs.next () ? rs.getLong ( 1 ) : 0; }
    }
  }

  private static long count2 ( Connection c, String sql, String a, String b ) throws Exception {
    try ( PreparedStatement ps = c.prepareStatement ( sql ) ) {
      ps.setString ( 1, a ); ps.setString ( 2, b );
      try ( ResultSet rs = ps.executeQuery () ) { return rs.next () ? rs.getLong ( 1 ) : 0; }
    }
  }

  private static long count3 ( Connection c, String sql, String a, String b, String d ) throws Exception {
    try ( PreparedStatement ps = c.prepareStatement ( sql ) ) {
      ps.setString ( 1, a ); ps.setString ( 2, b ); ps.setString ( 3, d );
      try ( ResultSet rs = ps.executeQuery () ) { return rs.next () ? rs.getLong ( 1 ) : 0; }
    }
  }

  private StatsHandler () {}
}
