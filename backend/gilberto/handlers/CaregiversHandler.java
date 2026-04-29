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

public final class CaregiversHandler implements HttpHandler {
  @Override
  public void handle ( HttpExchange ex ) throws IOException {
    if ( HttpUtil.preflight ( ex ) ) return;
    if ( !HttpUtil.requireApiKey ( ex ) ) { Audit.log ( ex, "auth_failed", "caregivers", null, "denied" ); return; }
    String m = ex.getRequestMethod ();
    if ( "GET".equalsIgnoreCase ( m ) ) { get ( ex ); return; }
    if ( "POST".equalsIgnoreCase ( m ) ) { post ( ex ); return; }
    HttpUtil.err ( ex, 405, "Method not allowed" );
  }

  private void get ( HttpExchange ex ) throws IOException {
    Map<String, String> q = HttpUtil.queryParams ( ex );
    String orgId = QueryUtil.eq ( q, "org_id" );
    String status = QueryUtil.eq ( q, "status" );
    String sql = "SELECT id, org_id, first_name, last_name, relationship, email, phone, status FROM caregivers";
    List<String> where = new ArrayList<> ();
    List<String> vals = new ArrayList<> ();
    if ( !JsonUtil.blank ( orgId ) ) { where.add ( "org_id = ?" ); vals.add ( orgId ); }
    if ( !JsonUtil.blank ( status ) ) { where.add ( "status = ?" ); vals.add ( status ); }
    if ( !where.isEmpty () ) sql += " WHERE " + String.join ( " AND ", where );
    sql += " ORDER BY last_name ASC, first_name ASC";

    try ( Connection c = Db.open (); PreparedStatement ps = c.prepareStatement ( sql ) ) {
      for ( int i = 0; i < vals.size (); i++ ) ps.setString ( i + 1, vals.get ( i ) );
      try ( ResultSet rs = ps.executeQuery () ) {
        List<String> rows = new ArrayList<> ();
        while ( rs.next () ) {
          rows.add ( "{"
              + "\"id\":\"" + JsonUtil.esc ( rs.getString ( "id" ) ) + "\","
              + "\"org_id\":" + JsonUtil.strOrNull ( rs.getString ( "org_id" ) ) + ","
              + "\"first_name\":" + JsonUtil.strOrNull ( rs.getString ( "first_name" ) ) + ","
              + "\"last_name\":" + JsonUtil.strOrNull ( rs.getString ( "last_name" ) ) + ","
              + "\"relationship\":" + JsonUtil.strOrNull ( rs.getString ( "relationship" ) ) + ","
              + "\"email\":" + JsonUtil.strOrNull ( rs.getString ( "email" ) ) + ","
              + "\"phone\":" + JsonUtil.strOrNull ( rs.getString ( "phone" ) ) + ","
              + "\"status\":" + JsonUtil.strOrNull ( rs.getString ( "status" ) )
              + "}" );
        }
        HttpUtil.json ( ex, 200, "[" + String.join ( ",", rows ) + "]" );
      }
    } catch ( Exception e ) {
      HttpUtil.err ( ex, 500, "Failed to fetch caregivers" );
    }
  }

  private void post ( HttpExchange ex ) throws IOException {
    String b = HttpUtil.body ( ex );
    String first = JsonUtil.field ( b, "first_name" );
    String last = JsonUtil.field ( b, "last_name" );
    if ( JsonUtil.blank ( first ) || JsonUtil.blank ( last ) ) {
      HttpUtil.err ( ex, 400, "first_name and last_name are required" ); return;
    }
    String sql = "INSERT INTO caregivers (id, org_id, first_name, last_name, relationship, email, phone, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
    try ( Connection c = Db.open (); PreparedStatement ps = c.prepareStatement ( sql ) ) {
      String id = UUID.randomUUID ().toString ();
      ps.setString ( 1, id );
      ps.setString ( 2, JsonUtil.field ( b, "org_id" ) );
      ps.setString ( 3, first );
      ps.setString ( 4, last );
      ps.setString ( 5, JsonUtil.field ( b, "relationship" ) );
      ps.setString ( 6, JsonUtil.field ( b, "email" ) );
      ps.setString ( 7, JsonUtil.field ( b, "phone" ) );
      ps.setString ( 8, JsonUtil.blank ( JsonUtil.field ( b, "status" ) ) ? "active" : JsonUtil.field ( b, "status" ) );
      ps.executeUpdate ();
      Audit.log ( ex, "create", "caregivers", id, "success" );
      HttpUtil.json ( ex, 201, "[{\"id\":\"" + id + "\"}]" );
    } catch ( Exception e ) {
      Audit.log ( ex, "create", "caregivers", null, "error" );
      HttpUtil.err ( ex, 500, "Failed to create caregiver" );
    }
  }
}
