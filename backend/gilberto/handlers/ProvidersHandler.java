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

public final class ProvidersHandler implements HttpHandler {
  @Override
  public void handle ( HttpExchange ex ) throws IOException {
    if ( HttpUtil.preflight ( ex ) ) return;
    if ( !HttpUtil.requireApiKey ( ex ) ) { Audit.log ( ex, "auth_failed", "providers", null, "denied" ); return; }
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
    String status = QueryUtil.eq ( q, "status" );
    String sql = "SELECT id, org_id, full_name, cert_type, cert_number, email, phone, start_date, end_date, authorization_info, status FROM providers";
    List<String> where = new ArrayList<> ();
    List<String> vals = new ArrayList<> ();
    if ( !JsonUtil.blank ( id ) ) { where.add ( "id = ?" ); vals.add ( id ); }
    if ( !JsonUtil.blank ( orgId ) ) { where.add ( "org_id = ?" ); vals.add ( orgId ); }
    if ( !JsonUtil.blank ( status ) ) { where.add ( "status = ?" ); vals.add ( status ); }
    if ( !where.isEmpty () ) sql += " WHERE " + String.join ( " AND ", where );
    sql += " ORDER BY full_name ASC";

    try ( Connection c = Db.open (); PreparedStatement ps = c.prepareStatement ( sql ) ) {
      for ( int i = 0; i < vals.size (); i++ ) ps.setString ( i + 1, vals.get ( i ) );
      try ( ResultSet rs = ps.executeQuery () ) {
        List<String> rows = new ArrayList<> ();
        while ( rs.next () ) {
          rows.add ( "{"
            + "\"id\":\"" + JsonUtil.esc ( rs.getString ( "id" ) ) + "\","
            + "\"org_id\":" + JsonUtil.strOrNull ( rs.getString ( "org_id" ) ) + ","
            + "\"full_name\":" + JsonUtil.strOrNull ( rs.getString ( "full_name" ) ) + ","
            + "\"cert_type\":" + JsonUtil.strOrNull ( rs.getString ( "cert_type" ) ) + ","
            + "\"cert_number\":" + JsonUtil.strOrNull ( rs.getString ( "cert_number" ) ) + ","
            + "\"email\":" + JsonUtil.strOrNull ( rs.getString ( "email" ) ) + ","
            + "\"phone\":" + JsonUtil.strOrNull ( rs.getString ( "phone" ) ) + ","
            + "\"start_date\":" + JsonUtil.strOrNull ( rs.getString ( "start_date" ) ) + ","
            + "\"end_date\":" + JsonUtil.strOrNull ( rs.getString ( "end_date" ) ) + ","
            + "\"authorization_info\":" + JsonUtil.strOrNull ( rs.getString ( "authorization_info" ) ) + ","
            + "\"status\":" + JsonUtil.strOrNull ( rs.getString ( "status" ) )
            + "}" );
        }
        HttpUtil.json ( ex, 200, "[" + String.join ( ",", rows ) + "]" );
      }
    } catch ( Exception e ) {
      HttpUtil.err ( ex, 500, "Failed to fetch providers" );
    }
  }

  private void post ( HttpExchange ex ) throws IOException {
    String b = HttpUtil.body ( ex );
    String name = JsonUtil.field ( b, "full_name" );
    if ( JsonUtil.blank ( name ) ) { HttpUtil.err ( ex, 400, "full_name is required" ); return; }
    String id = UUID.randomUUID ().toString ();
    String sql = "INSERT INTO providers (id, org_id, full_name, cert_type, cert_number, email, phone, start_date, end_date, authorization_info, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    try ( Connection c = Db.open (); PreparedStatement ps = c.prepareStatement ( sql ) ) {
      ps.setString ( 1, id );
      ps.setString ( 2, JsonUtil.field ( b, "org_id" ) );
      ps.setString ( 3, name );
      ps.setString ( 4, JsonUtil.field ( b, "cert_type" ) );
      ps.setString ( 5, JsonUtil.field ( b, "cert_number" ) );
      ps.setString ( 6, JsonUtil.field ( b, "email" ) );
      ps.setString ( 7, JsonUtil.field ( b, "phone" ) );
      ps.setString ( 8, JsonUtil.field ( b, "start_date" ) );
      ps.setString ( 9, JsonUtil.field ( b, "end_date" ) );
      ps.setString ( 10, JsonUtil.field ( b, "authorization_info" ) );
      ps.setString ( 11, JsonUtil.blank ( JsonUtil.field ( b, "status" ) ) ? "active" : JsonUtil.field ( b, "status" ) );
      ps.executeUpdate ();
      Audit.log ( ex, "create", "providers", id, "success" );
      HttpUtil.json ( ex, 201, "[{\"id\":\"" + id + "\"}]" );
    } catch ( Exception e ) {
      Audit.log ( ex, "create", "providers", null, "error" );
      HttpUtil.err ( ex, 500, "Failed to create provider" );
    }
  }

  private void patch ( HttpExchange ex ) throws IOException {
    Map<String, String> q = HttpUtil.queryParams ( ex );
    String id = QueryUtil.eq ( q, "id" );
    if ( JsonUtil.blank ( id ) ) { HttpUtil.err ( ex, 400, "id=eq.<id> is required" ); return; }
    String b = HttpUtil.body ( ex );
    String sql = "UPDATE providers SET full_name = COALESCE(?, full_name), cert_type = COALESCE(?, cert_type), cert_number = COALESCE(?, cert_number), email = COALESCE(?, email), phone = COALESCE(?, phone), start_date = COALESCE(?, start_date), end_date = COALESCE(?, end_date), authorization_info = COALESCE(?, authorization_info), status = COALESCE(?, status) WHERE id = ?";
    try ( Connection c = Db.open (); PreparedStatement ps = c.prepareStatement ( sql ) ) {
      ps.setString ( 1, JsonUtil.field ( b, "full_name" ) );
      ps.setString ( 2, JsonUtil.field ( b, "cert_type" ) );
      ps.setString ( 3, JsonUtil.field ( b, "cert_number" ) );
      ps.setString ( 4, JsonUtil.field ( b, "email" ) );
      ps.setString ( 5, JsonUtil.field ( b, "phone" ) );
      ps.setString ( 6, JsonUtil.field ( b, "start_date" ) );
      ps.setString ( 7, JsonUtil.field ( b, "end_date" ) );
      ps.setString ( 8, JsonUtil.field ( b, "authorization_info" ) );
      ps.setString ( 9, JsonUtil.field ( b, "status" ) );
      ps.setString ( 10, id );
      ps.executeUpdate ();
      Audit.log ( ex, "update", "providers", id, "success" );
      ex.sendResponseHeaders ( 204, -1 );
    } catch ( Exception e ) {
      Audit.log ( ex, "update", "providers", id, "error" );
      HttpUtil.err ( ex, 500, "Failed to update provider" );
    }
  }

  private void delete ( HttpExchange ex ) throws IOException {
    Map<String, String> q = HttpUtil.queryParams ( ex );
    String id = QueryUtil.eq ( q, "id" );
    if ( JsonUtil.blank ( id ) ) { HttpUtil.err ( ex, 400, "id=eq.<id> is required" ); return; }
    try ( Connection c = Db.open (); PreparedStatement ps = c.prepareStatement ( "DELETE FROM providers WHERE id = ?" ) ) {
      ps.setString ( 1, id );
      ps.executeUpdate ();
      Audit.log ( ex, "delete", "providers", id, "success" );
      ex.sendResponseHeaders ( 204, -1 );
    } catch ( Exception e ) {
      Audit.log ( ex, "delete", "providers", id, "error" );
      HttpUtil.err ( ex, 500, "Failed to delete provider" );
    }
  }
}
