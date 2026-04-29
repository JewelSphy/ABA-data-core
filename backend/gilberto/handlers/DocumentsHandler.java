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

public final class DocumentsHandler implements HttpHandler {
  @Override
  public void handle ( HttpExchange ex ) throws IOException {
    if ( HttpUtil.preflight ( ex ) ) return;
    if ( !HttpUtil.requireApiKey ( ex ) ) { Audit.log ( ex, "auth_failed", "documents", null, "denied" ); return; }
    String m = ex.getRequestMethod ();
    if ( "GET".equalsIgnoreCase ( m ) ) { get ( ex ); return; }
    if ( "POST".equalsIgnoreCase ( m ) ) { post ( ex ); return; }
    if ( "DELETE".equalsIgnoreCase ( m ) ) { delete ( ex ); return; }
    HttpUtil.err ( ex, 405, "Method not allowed" );
  }

  private void get ( HttpExchange ex ) throws IOException {
    Map<String, String> q = HttpUtil.queryParams ( ex );
    String id = QueryUtil.eq ( q, "id" );
    String orgId = QueryUtil.eq ( q, "org_id" );
    String providerId = QueryUtil.eq ( q, "provider_id" );
    String status = QueryUtil.eq ( q, "status" );
    String sql = "SELECT id, org_id, provider_id, doc_name, doc_type, linked_name, upload_date, expiry_date, status, content_text FROM documents";
    List<String> where = new ArrayList<> ();
    List<String> vals = new ArrayList<> ();
    if ( !JsonUtil.blank ( id ) ) { where.add ( "id = ?" ); vals.add ( id ); }
    if ( !JsonUtil.blank ( orgId ) ) { where.add ( "org_id = ?" ); vals.add ( orgId ); }
    if ( !JsonUtil.blank ( providerId ) ) { where.add ( "provider_id = ?" ); vals.add ( providerId ); }
    if ( !JsonUtil.blank ( status ) ) { where.add ( "status = ?" ); vals.add ( status ); }
    if ( !where.isEmpty () ) sql += " WHERE " + String.join ( " AND ", where );
    sql += " ORDER BY upload_date DESC, created_at DESC LIMIT 500";

    try ( Connection c = Db.open (); PreparedStatement ps = c.prepareStatement ( sql ) ) {
      for ( int i = 0; i < vals.size (); i++ ) ps.setString ( i + 1, vals.get ( i ) );
      try ( ResultSet rs = ps.executeQuery () ) {
        List<String> rows = new ArrayList<> ();
        while ( rs.next () ) {
          rows.add ( "{"
            + "\"id\":\"" + JsonUtil.esc ( rs.getString ( "id" ) ) + "\","
            + "\"org_id\":" + JsonUtil.strOrNull ( rs.getString ( "org_id" ) ) + ","
            + "\"provider_id\":" + JsonUtil.strOrNull ( rs.getString ( "provider_id" ) ) + ","
            + "\"doc_name\":" + JsonUtil.strOrNull ( rs.getString ( "doc_name" ) ) + ","
            + "\"doc_type\":" + JsonUtil.strOrNull ( rs.getString ( "doc_type" ) ) + ","
            + "\"linked_name\":" + JsonUtil.strOrNull ( rs.getString ( "linked_name" ) ) + ","
            + "\"upload_date\":" + JsonUtil.strOrNull ( rs.getString ( "upload_date" ) ) + ","
            + "\"expiry_date\":" + JsonUtil.strOrNull ( rs.getString ( "expiry_date" ) ) + ","
            + "\"status\":" + JsonUtil.strOrNull ( rs.getString ( "status" ) ) + ","
            + "\"content_text\":" + JsonUtil.strOrNull ( rs.getString ( "content_text" ) )
            + "}" );
        }
        HttpUtil.json ( ex, 200, "[" + String.join ( ",", rows ) + "]" );
      }
    } catch ( Exception e ) {
      HttpUtil.err ( ex, 500, "Failed to fetch documents" );
    }
  }

  private void post ( HttpExchange ex ) throws IOException {
    String b = HttpUtil.body ( ex );
    String name = JsonUtil.field ( b, "doc_name" );
    if ( JsonUtil.blank ( name ) ) { HttpUtil.err ( ex, 400, "doc_name is required" ); return; }
    String id = UUID.randomUUID ().toString ();
    String sql = "INSERT INTO documents (id, org_id, provider_id, doc_name, doc_type, linked_name, upload_date, expiry_date, status, content_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    try ( Connection c = Db.open (); PreparedStatement ps = c.prepareStatement ( sql ) ) {
      ps.setString ( 1, id );
      ps.setString ( 2, JsonUtil.field ( b, "org_id" ) );
      ps.setString ( 3, JsonUtil.field ( b, "provider_id" ) );
      ps.setString ( 4, name );
      ps.setString ( 5, JsonUtil.field ( b, "doc_type" ) );
      ps.setString ( 6, JsonUtil.field ( b, "linked_name" ) );
      ps.setString ( 7, JsonUtil.field ( b, "upload_date" ) );
      ps.setString ( 8, JsonUtil.field ( b, "expiry_date" ) );
      ps.setString ( 9, JsonUtil.blank ( JsonUtil.field ( b, "status" ) ) ? "active" : JsonUtil.field ( b, "status" ) );
      ps.setString ( 10, JsonUtil.field ( b, "content_text" ) );
      ps.executeUpdate ();
      Audit.log ( ex, "create", "documents", id, "success" );
      HttpUtil.json ( ex, 201, "[{\"id\":\"" + id + "\"}]" );
    } catch ( Exception e ) {
      Audit.log ( ex, "create", "documents", null, "error" );
      HttpUtil.err ( ex, 500, "Failed to save document" );
    }
  }

  private void delete ( HttpExchange ex ) throws IOException {
    Map<String, String> q = HttpUtil.queryParams ( ex );
    String id = QueryUtil.eq ( q, "id" );
    if ( JsonUtil.blank ( id ) ) { HttpUtil.err ( ex, 400, "id=eq.<id> is required" ); return; }
    try ( Connection c = Db.open (); PreparedStatement ps = c.prepareStatement ( "DELETE FROM documents WHERE id = ?" ) ) {
      ps.setString ( 1, id );
      ps.executeUpdate ();
      Audit.log ( ex, "delete", "documents", id, "success" );
      ex.sendResponseHeaders ( 204, -1 );
    } catch ( Exception e ) {
      Audit.log ( ex, "delete", "documents", id, "error" );
      HttpUtil.err ( ex, 500, "Failed to delete document" );
    }
  }
}
