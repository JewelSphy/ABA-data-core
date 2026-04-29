package gilberto.handlers;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import gilberto.Audit;
import gilberto.Db;
import gilberto.HttpUtil;
import gilberto.JsonUtil;
import gilberto.QueryUtil;
import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class SessionNotesHandler implements HttpHandler {
  @Override
  public void handle ( HttpExchange ex ) throws IOException {
    if ( HttpUtil.preflight ( ex ) ) return;
    if ( !HttpUtil.requireApiKey ( ex ) ) { Audit.log ( ex, "auth_failed", "session_notes", null, "denied" ); return; }
    String m = ex.getRequestMethod ();
    if ( "GET".equalsIgnoreCase ( m ) ) { get ( ex ); return; }
    if ( "POST".equalsIgnoreCase ( m ) ) { post ( ex ); return; }
    HttpUtil.err ( ex, 405, "Method not allowed" );
  }

  private void get ( HttpExchange ex ) throws IOException {
    Map<String, String> q = HttpUtil.queryParams ( ex );
    String id = QueryUtil.eq ( q, "id" );
    String sessionId = QueryUtil.eq ( q, "session_id" );
    String orgId = QueryUtil.eq ( q, "org_id" );
    String sql = Db.readSql ( "sql/session_notes/select.sql" );
    List<String> where = new ArrayList<> ();
    List<String> vals = new ArrayList<> ();
    if ( !JsonUtil.blank ( id ) ) { where.add ( "n.id = ?" ); vals.add ( id ); }
    if ( !JsonUtil.blank ( sessionId ) ) { where.add ( "n.session_id = ?" ); vals.add ( sessionId ); }
    if ( !JsonUtil.blank ( orgId ) ) { where.add ( "n.org_id = ?" ); vals.add ( orgId ); }
    if ( !where.isEmpty () ) sql += " WHERE " + String.join ( " AND ", where );
    sql += " ORDER BY n.updated_at DESC LIMIT 50";

    try ( Connection c = Db.open (); PreparedStatement ps = c.prepareStatement ( sql ) ) {
      for ( int i = 0; i < vals.size (); i++ ) ps.setString ( i + 1, vals.get ( i ) );
      try ( ResultSet rs = ps.executeQuery () ) {
        List<String> rows = new ArrayList<> ();
        while ( rs.next () ) {
          rows.add ( "{"
            + "\"id\":\"" + JsonUtil.esc ( rs.getString ( "id" ) ) + "\","
            + "\"session_id\":" + JsonUtil.strOrNull ( rs.getString ( "session_id" ) ) + ","
            + "\"org_id\":" + JsonUtil.strOrNull ( rs.getString ( "org_id" ) ) + ","
            + "\"progress_note\":" + JsonUtil.strOrNull ( rs.getString ( "progress_note" ) ) + ","
            + "\"similarity_percent\":" + intOrNull ( rs, "similarity_percent" ) + ","
            + "\"supervision_required\":" + ( rs.getBoolean ( "supervision_required" ) ? "true" : "false" ) + ","
            + "\"rbt_signed_by\":" + JsonUtil.strOrNull ( rs.getString ( "rbt_signed_by" ) ) + ","
            + "\"rbt_signed_at\":" + JsonUtil.strOrNull ( ts ( rs, "rbt_signed_at" ) ) + ","
            + "\"supervisor_signed_by\":" + JsonUtil.strOrNull ( rs.getString ( "supervisor_signed_by" ) ) + ","
            + "\"supervisor_signed_at\":" + JsonUtil.strOrNull ( ts ( rs, "supervisor_signed_at" ) ) + ","
            + "\"submitted_by\":" + JsonUtil.strOrNull ( rs.getString ( "submitted_by" ) ) + ","
            + "\"submitted_at\":" + JsonUtil.strOrNull ( ts ( rs, "submitted_at" ) ) + ","
            + "\"status\":" + JsonUtil.strOrNull ( rs.getString ( "status" ) ) + ","
            + "\"updated_at\":" + JsonUtil.strOrNull ( ts ( rs, "updated_at" ) ) + ","
            + "\"session_date\":" + JsonUtil.strOrNull ( rs.getString ( "session_date" ) ) + ","
            + "\"service_type\":" + JsonUtil.strOrNull ( rs.getString ( "service_type" ) ) + ","
            + "\"client\":{\"first_name\":" + JsonUtil.strOrNull ( rs.getString ( "client_first_name" ) ) + ",\"last_name\":" + JsonUtil.strOrNull ( rs.getString ( "client_last_name" ) ) + "}"
            + "}" );
        }
        HttpUtil.json ( ex, 200, "[" + String.join ( ",", rows ) + "]" );
      }
    } catch ( Exception e ) {
      String msg = e.getMessage () == null ? "" : e.getMessage ().toLowerCase ();
      if ( msg.contains ( "doesn't exist" ) || msg.contains ( "does not exist" ) || msg.contains ( "unknown table" ) ) {
        // If schema was not re-initialized yet, return empty list instead of hard failing UI.
        HttpUtil.json ( ex, 200, "[]" );
        return;
      }
      HttpUtil.err ( ex, 500, "Failed to fetch session notes" );
    }
  }

  private void post ( HttpExchange ex ) throws IOException {
    String b = HttpUtil.body ( ex );
    String sessionId = JsonUtil.field ( b, "session_id" );
    if ( JsonUtil.blank ( sessionId ) ) {
      HttpUtil.err ( ex, 400, "session_id is required" );
      return;
    }
    String sql = Db.readSql ( "sql/session_notes/upsert.sql" );
    try ( Connection c = Db.open (); PreparedStatement ps = c.prepareStatement ( sql ) ) {
      ps.setString ( 1, UUID.randomUUID ().toString () );
      ps.setString ( 2, sessionId );
      ps.setString ( 3, JsonUtil.field ( b, "org_id" ) );
      ps.setString ( 4, JsonUtil.field ( b, "progress_note" ) );
      setIntOrNull ( ps, 5, JsonUtil.field ( b, "similarity_percent" ) );
      ps.setBoolean ( 6, bool ( JsonUtil.field ( b, "supervision_required" ) ) );
      ps.setString ( 7, JsonUtil.field ( b, "rbt_signed_by" ) );
      ps.setTimestamp ( 8, tsOrNull ( JsonUtil.field ( b, "rbt_signed_at" ) ) );
      ps.setString ( 9, JsonUtil.field ( b, "supervisor_signed_by" ) );
      ps.setTimestamp ( 10, tsOrNull ( JsonUtil.field ( b, "supervisor_signed_at" ) ) );
      ps.setString ( 11, JsonUtil.field ( b, "submitted_by" ) );
      ps.setTimestamp ( 12, tsOrNull ( JsonUtil.field ( b, "submitted_at" ) ) );
      ps.setString ( 13, JsonUtil.blank ( JsonUtil.field ( b, "status" ) ) ? "draft" : JsonUtil.field ( b, "status" ) );
      ps.executeUpdate ();
      Audit.log ( ex, "upsert", "session_notes", sessionId, "success" );
      HttpUtil.json ( ex, 201, "{\"ok\":true}" );
    } catch ( Exception e ) {
      Audit.log ( ex, "upsert", "session_notes", sessionId, "error" );
      HttpUtil.err ( ex, 500, "Failed to save session note" );
    }
  }

  private String intOrNull ( ResultSet rs, String col ) throws Exception {
    int v = rs.getInt ( col );
    return rs.wasNull () ? "null" : String.valueOf ( v );
  }

  private void setIntOrNull ( PreparedStatement ps, int idx, String raw ) throws Exception {
    if ( JsonUtil.blank ( raw ) ) { ps.setObject ( idx, null ); return; }
    ps.setInt ( idx, Integer.parseInt ( raw ) );
  }

  private boolean bool ( String s ) {
    if ( JsonUtil.blank ( s ) ) return false;
    return "true".equalsIgnoreCase ( s ) || "1".equals ( s );
  }

  private Timestamp tsOrNull ( String s ) {
    if ( JsonUtil.blank ( s ) ) return null;
    try {
      return Timestamp.from ( Instant.parse ( s ) );
    } catch ( Exception ignored ) {
      return null;
    }
  }

  private String ts ( ResultSet rs, String col ) throws Exception {
    Timestamp t = rs.getTimestamp ( col );
    return t == null ? null : t.toInstant ().toString ();
  }
}
