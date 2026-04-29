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
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class SessionsHandler implements HttpHandler {
  @Override
  public void handle ( HttpExchange ex ) throws IOException {
    if ( HttpUtil.preflight ( ex ) ) return;
    if ( !HttpUtil.requireApiKey ( ex ) ) { Audit.log ( ex, "auth_failed", "sessions", null, "denied" ); return; }
    String m = ex.getRequestMethod ();
    if ( "GET".equalsIgnoreCase ( m ) ) { get ( ex ); return; }
    if ( "POST".equalsIgnoreCase ( m ) ) { post ( ex ); return; }
    if ( "PATCH".equalsIgnoreCase ( m ) ) { patch ( ex ); return; }
    if ( "DELETE".equalsIgnoreCase ( m ) ) { delete ( ex ); return; }
    HttpUtil.err ( ex, 405, "Method not allowed" );
  }

  private void get ( HttpExchange ex ) throws IOException {
    Map<String, String> q = HttpUtil.queryParams ( ex );
    String id = QueryUtil.eq ( q, "id" );
    String orgId = QueryUtil.eq ( q, "org_id" );
    String gte = q.get ( "session_date" ) != null && q.get ( "session_date" ).startsWith ( "gte." ) ? q.get ( "session_date" ).substring ( 4 ) : null;
    String lte = q.get ( "session_date" ) != null && q.get ( "session_date" ).startsWith ( "lte." ) ? q.get ( "session_date" ).substring ( 4 ) : null;
    int limit = QueryUtil.intOrDefault ( q, "limit", 500 );

    String sql = Db.readSql ( "sql/sessions/select.sql" );
    if ( JsonUtil.blank ( sql ) ) { HttpUtil.err ( ex, 500, "Missing sql/sessions/select.sql" ); return; }
    List<String> where = new ArrayList<> ();
    List<String> vals = new ArrayList<> ();
    if ( !JsonUtil.blank ( id ) )    { where.add ( "s.id = ?" ); vals.add ( id ); }
    if ( !JsonUtil.blank ( orgId ) ) { where.add ( "s.org_id = ?" ); vals.add ( orgId ); }
    if ( !JsonUtil.blank ( gte ) )   { where.add ( "s.session_date >= ?" ); vals.add ( gte ); }
    if ( !JsonUtil.blank ( lte ) )   { where.add ( "s.session_date <= ?" ); vals.add ( lte ); }
    if ( !where.isEmpty () ) sql += " WHERE " + String.join ( " AND ", where );
    sql += " ORDER BY s.session_date DESC, s.start_time DESC LIMIT " + Math.max ( 1, Math.min ( 1000, limit ) );

    try ( Connection c = Db.open (); PreparedStatement ps = c.prepareStatement ( sql ) ) {
      for ( int i = 0; i < vals.size (); i++ ) ps.setString ( i + 1, vals.get ( i ) );
      try ( ResultSet rs = ps.executeQuery () ) {
        List<String> rows = new ArrayList<> ();
        while ( rs.next () ) {
          rows.add ( "{"
              + "\"id\":\"" + JsonUtil.esc ( rs.getString ( "id" ) ) + "\","
              + "\"org_id\":" + JsonUtil.strOrNull ( rs.getString ( "org_id" ) ) + ","
              + "\"client_id\":" + JsonUtil.strOrNull ( rs.getString ( "client_id" ) ) + ","
              + "\"staff_id\":" + JsonUtil.strOrNull ( rs.getString ( "staff_id" ) ) + ","
              + "\"service_type\":" + JsonUtil.strOrNull ( rs.getString ( "service_type" ) ) + ","
              + "\"session_date\":" + JsonUtil.strOrNull ( rs.getString ( "session_date" ) ) + ","
              + "\"start_time\":" + JsonUtil.strOrNull ( rs.getString ( "start_time" ) ) + ","
              + "\"end_time\":" + JsonUtil.strOrNull ( rs.getString ( "end_time" ) ) + ","
              + "\"status\":" + JsonUtil.strOrNull ( rs.getString ( "status" ) ) + ","
              + "\"pos\":" + JsonUtil.strOrNull ( rs.getString ( "pos" ) ) + ","
              + "\"procedure_code\":" + JsonUtil.strOrNull ( rs.getString ( "procedure_code" ) ) + ","
              + "\"notes\":" + JsonUtil.strOrNull ( rs.getString ( "notes" ) ) + ","
              + "\"clients\":{\"first_name\":" + JsonUtil.strOrNull ( rs.getString ( "client_first_name" ) ) + ",\"last_name\":" + JsonUtil.strOrNull ( rs.getString ( "client_last_name" ) ) + "},"
              + "\"staff\":{\"first_name\":" + JsonUtil.strOrNull ( rs.getString ( "staff_first_name" ) ) + ",\"last_name\":" + JsonUtil.strOrNull ( rs.getString ( "staff_last_name" ) ) + "}"
              + "}" );
        }
        HttpUtil.json ( ex, 200, "[" + String.join ( ",", rows ) + "]" );
      }
    } catch ( Exception e ) {
      HttpUtil.err ( ex, 500, "Failed to fetch sessions" );
    }
  }

  private void post ( HttpExchange ex ) throws IOException {
    String b = HttpUtil.body ( ex );
    String id = UUID.randomUUID ().toString ();
    String sql = Db.readSql ( "sql/sessions/insert.sql" );
    try ( Connection c = Db.open (); PreparedStatement ps = c.prepareStatement ( sql ) ) {
      String sessionDate = normalizeDate ( JsonUtil.field ( b, "session_date" ) );
      String startTime = normalizeTime ( JsonUtil.field ( b, "start_time" ) );
      String endTime = normalizeTime ( JsonUtil.field ( b, "end_time" ) );
      ps.setString ( 1, id );
      ps.setString ( 2, nullIfBlank ( JsonUtil.field ( b, "org_id" ) ) );
      ps.setString ( 3, nullIfBlank ( JsonUtil.field ( b, "client_id" ) ) );
      ps.setString ( 4, nullIfBlank ( JsonUtil.field ( b, "staff_id" ) ) );
      ps.setString ( 5, JsonUtil.field ( b, "service_type" ) );
      ps.setString ( 6, sessionDate );
      ps.setString ( 7, startTime );
      ps.setString ( 8, endTime );
      ps.setString ( 9, JsonUtil.blank ( JsonUtil.field ( b, "status" ) ) ? "pending" : JsonUtil.field ( b, "status" ) );
      ps.setString ( 10, JsonUtil.field ( b, "pos" ) );
      ps.setString ( 11, JsonUtil.field ( b, "procedure_code" ) );
      ps.setString ( 12, JsonUtil.field ( b, "notes" ) );
      ps.executeUpdate ();
      Audit.log ( ex, "create", "sessions", id, "success" );
      HttpUtil.json ( ex, 201, "[{\"id\":\"" + id + "\"}]" );
    } catch ( Exception e ) {
      System.err.println ( "[sessions.post] " + e.getClass ().getSimpleName () + ": " + e.getMessage () );
      Audit.log ( ex, "create", "sessions", null, "error" );
      HttpUtil.err ( ex, 500, "Failed to create session" );
    }
  }

  private void patch ( HttpExchange ex ) throws IOException {
    String id = QueryUtil.eq ( HttpUtil.queryParams ( ex ), "id" );
    if ( JsonUtil.blank ( id ) ) { HttpUtil.err ( ex, 400, "id=eq.<id> is required" ); return; }
    String b = HttpUtil.body ( ex );
    String sql = Db.readSql ( "sql/sessions/update.sql" );
    try ( Connection c = Db.open (); PreparedStatement ps = c.prepareStatement ( sql ) ) {
      ps.setString ( 1, JsonUtil.field ( b, "service_type" ) );
      ps.setString ( 2, JsonUtil.field ( b, "session_date" ) );
      ps.setString ( 3, JsonUtil.field ( b, "start_time" ) );
      ps.setString ( 4, JsonUtil.field ( b, "end_time" ) );
      ps.setString ( 5, JsonUtil.field ( b, "status" ) );
      ps.setString ( 6, JsonUtil.field ( b, "pos" ) );
      ps.setString ( 7, JsonUtil.field ( b, "procedure_code" ) );
      ps.setString ( 8, JsonUtil.field ( b, "notes" ) );
      ps.setString ( 9, id );
      ps.executeUpdate ();
      Audit.log ( ex, "update", "sessions", id, "success" );
      ex.sendResponseHeaders ( 204, -1 );
    } catch ( Exception e ) {
      Audit.log ( ex, "update", "sessions", id, "error" );
      HttpUtil.err ( ex, 500, "Failed to update session" );
    }
  }

  private void delete ( HttpExchange ex ) throws IOException {
    String id = QueryUtil.eq ( HttpUtil.queryParams ( ex ), "id" );
    if ( JsonUtil.blank ( id ) ) { HttpUtil.err ( ex, 400, "id=eq.<id> is required" ); return; }
    try ( Connection c = Db.open (); PreparedStatement ps = c.prepareStatement ( "DELETE FROM sessions WHERE id = ?" ) ) {
      ps.setString ( 1, id );
      ps.executeUpdate ();
      Audit.log ( ex, "delete", "sessions", id, "success" );
      ex.sendResponseHeaders ( 204, -1 );
    } catch ( Exception e ) {
      Audit.log ( ex, "delete", "sessions", id, "error" );
      HttpUtil.err ( ex, 500, "Failed to delete session" );
    }
  }

  private String nullIfBlank ( String s ) {
    return JsonUtil.blank ( s ) ? null : s;
  }

  private String normalizeDate ( String raw ) {
    if ( JsonUtil.blank ( raw ) ) return null;
    String s = raw.strip ();
    // Already ISO date
    if ( s.matches ( "\\d{4}-\\d{2}-\\d{2}" ) ) return s;
    // MM/DD/YYYY -> YYYY-MM-DD
    if ( s.matches ( "\\d{2}/\\d{2}/\\d{4}" ) ) {
      String[] p = s.split ( "/" );
      return p[2] + "-" + p[0] + "-" + p[1];
    }
    return s;
  }

  private String normalizeTime ( String raw ) {
    if ( JsonUtil.blank ( raw ) ) return null;
    String s = raw.strip ();
    // HH:mm -> HH:mm:ss
    if ( s.matches ( "\\d{2}:\\d{2}" ) ) return s + ":00";
    // HH:mm:ss already valid
    if ( s.matches ( "\\d{2}:\\d{2}:\\d{2}" ) ) return s;
    // h:mm AM/PM -> HH:mm:ss
    if ( s.matches ( "\\d{1,2}:\\d{2}\\s*[AaPp][Mm]" ) ) {
      String[] parts = s.toUpperCase ().split ( "\\s+" );
      String[] hm = parts[0].split ( ":" );
      int h = Integer.parseInt ( hm[0] );
      String m = hm[1];
      boolean pm = "PM".equals ( parts[1] );
      if ( pm && h < 12 ) h += 12;
      if ( !pm && h == 12 ) h = 0;
      return String.format ( "%02d:%s:00", h, m );
    }
    return s;
  }
}
