package gilberto.handlers;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import gilberto.Audit;
import gilberto.Db;
import gilberto.RequiredClientDocuments;
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

public final class ClientsHandler implements HttpHandler {

  @Override
  public void handle ( HttpExchange ex ) throws IOException {
    if ( HttpUtil.preflight ( ex ) ) return;
    if ( !HttpUtil.requireApiKey ( ex ) ) { Audit.log ( ex, "auth_failed", "clients", null, "denied" ); return; }
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

    String sql = Db.readSql ( "sql/clients/select.sql" );
    if ( JsonUtil.blank ( sql ) ) { HttpUtil.err ( ex, 500, "Missing sql/clients/select.sql" ); return; }

    List<String> where = new ArrayList<> ();
    List<String> vals = new ArrayList<> ();
    if ( !JsonUtil.blank ( id ) )    { where.add ( "c.id = ?" ); vals.add ( id ); }
    if ( !JsonUtil.blank ( orgId ) ) { where.add ( "c.org_id = ?" ); vals.add ( orgId ); }
    if ( !JsonUtil.blank ( status )) { where.add ( "c.status = ?" ); vals.add ( status ); }
    if ( !where.isEmpty () ) sql += " WHERE " + String.join ( " AND ", where );
    sql += " ORDER BY c.last_name ASC, c.first_name ASC";

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
              + "\"date_of_birth\":" + JsonUtil.strOrNull ( rs.getString ( "date_of_birth" ) ) + ","
              + "\"diagnosis\":" + JsonUtil.strOrNull ( rs.getString ( "diagnosis" ) ) + ","
              + "\"assigned_rbt_id\":" + JsonUtil.strOrNull ( rs.getString ( "assigned_rbt_id" ) ) + ","
              + "\"assigned_bcba_id\":" + JsonUtil.strOrNull ( rs.getString ( "assigned_bcba_id" ) ) + ","
              + "\"insurance_provider\":" + JsonUtil.strOrNull ( rs.getString ( "insurance_provider" ) ) + ","
              + "\"email\":" + JsonUtil.strOrNull ( rs.getString ( "email" ) ) + ","
              + "\"phone\":" + JsonUtil.strOrNull ( rs.getString ( "phone" ) ) + ","
              + "\"auth_status\":" + JsonUtil.strOrNull ( rs.getString ( "auth_status" ) ) + ","
              + "\"notes\":" + JsonUtil.strOrNull ( rs.getString ( "notes" ) ) + ","
              + "\"status\":" + JsonUtil.strOrNull ( rs.getString ( "status" ) )
              + "}" );
        }
        HttpUtil.json ( ex, 200, "[" + String.join ( ",", rows ) + "]" );
      }
    } catch ( Exception e ) {
      HttpUtil.err ( ex, 500, "Failed to fetch clients" );
    }
  }

  private void post ( HttpExchange ex ) throws IOException {
    String b = HttpUtil.body ( ex );
    String id = UUID.randomUUID ().toString ();
    String org = JsonUtil.field ( b, "org_id" );
    String first = JsonUtil.field ( b, "first_name" );
    String last = JsonUtil.field ( b, "last_name" );
    if ( JsonUtil.blank ( first ) || JsonUtil.blank ( last ) ) {
      HttpUtil.err ( ex, 400, "first_name and last_name are required" ); return;
    }

    String sql = Db.readSql ( "sql/clients/insert.sql" );
    try ( Connection c = Db.open (); PreparedStatement ps = c.prepareStatement ( sql ) ) {
      ps.setString ( 1, id );
      ps.setString ( 2, org );
      ps.setString ( 3, first );
      ps.setString ( 4, last );
      ps.setString ( 5, JsonUtil.field ( b, "date_of_birth" ) );
      ps.setString ( 6, JsonUtil.field ( b, "diagnosis" ) );
      ps.setString ( 7, JsonUtil.field ( b, "assigned_rbt_id" ) );
      ps.setString ( 8, JsonUtil.field ( b, "assigned_bcba_id" ) );
      ps.setString ( 9, JsonUtil.field ( b, "insurance_provider" ) );
      ps.setString ( 10, JsonUtil.field ( b, "email" ) );
      ps.setString ( 11, JsonUtil.field ( b, "phone" ) );
      ps.setString ( 12, safeOrDefault ( JsonUtil.field ( b, "auth_status" ), "active" ) );
      ps.setString ( 13, JsonUtil.field ( b, "notes" ) );
      ps.setString ( 14, safeOrDefault ( JsonUtil.field ( b, "status" ), "active" ) );
      ps.executeUpdate ();
      RequiredClientDocuments.seedForClient ( c, org, id, first, last );
      Audit.log ( ex, "create", "clients", id, "success" );
      HttpUtil.json ( ex, 201, "[{\"id\":\"" + id + "\"}]" );
    } catch ( Exception e ) {
      Audit.log ( ex, "create", "clients", null, "error" );
      HttpUtil.err ( ex, 500, "Failed to create client" );
    }
  }

  private void patch ( HttpExchange ex ) throws IOException {
    Map<String, String> q = HttpUtil.queryParams ( ex );
    String id = QueryUtil.eq ( q, "id" );
    if ( JsonUtil.blank ( id ) ) { HttpUtil.err ( ex, 400, "id=eq.<id> is required" ); return; }
    String b = HttpUtil.body ( ex );

    String sql = Db.readSql ( "sql/clients/update.sql" );
    try ( Connection c = Db.open (); PreparedStatement ps = c.prepareStatement ( sql ) ) {
      ps.setString ( 1, JsonUtil.field ( b, "first_name" ) );
      ps.setString ( 2, JsonUtil.field ( b, "last_name" ) );
      ps.setString ( 3, JsonUtil.field ( b, "date_of_birth" ) );
      ps.setString ( 4, JsonUtil.field ( b, "diagnosis" ) );
      ps.setString ( 5, JsonUtil.field ( b, "assigned_rbt_id" ) );
      ps.setString ( 6, JsonUtil.field ( b, "assigned_bcba_id" ) );
      ps.setString ( 7, JsonUtil.field ( b, "insurance_provider" ) );
      ps.setString ( 8, JsonUtil.field ( b, "email" ) );
      ps.setString ( 9, JsonUtil.field ( b, "phone" ) );
      ps.setString ( 10, JsonUtil.field ( b, "auth_status" ) );
      ps.setString ( 11, JsonUtil.field ( b, "notes" ) );
      ps.setString ( 12, JsonUtil.field ( b, "status" ) );
      ps.setString ( 13, id );
      ps.executeUpdate ();
      Audit.log ( ex, "update", "clients", id, "success" );
      ex.sendResponseHeaders ( 204, -1 );
    } catch ( Exception e ) {
      Audit.log ( ex, "update", "clients", id, "error" );
      HttpUtil.err ( ex, 500, "Failed to update client" );
    }
  }

  private void delete ( HttpExchange ex ) throws IOException {
    Map<String, String> q = HttpUtil.queryParams ( ex );
    String id = QueryUtil.eq ( q, "id" );
    if ( JsonUtil.blank ( id ) ) { HttpUtil.err ( ex, 400, "id=eq.<id> is required" ); return; }
    String sql = "DELETE FROM clients WHERE id = ?";
    try ( Connection c = Db.open (); PreparedStatement ps = c.prepareStatement ( sql ) ) {
      ps.setString ( 1, id );
      ps.executeUpdate ();
      Audit.log ( ex, "delete", "clients", id, "success" );
      ex.sendResponseHeaders ( 204, -1 );
    } catch ( Exception e ) {
      Audit.log ( ex, "delete", "clients", id, "error" );
      HttpUtil.err ( ex, 500, "Failed to delete client" );
    }
  }

  private String safeOrDefault ( String s, String fallback ) {
    return JsonUtil.blank ( s ) ? fallback : s;
  }
}
