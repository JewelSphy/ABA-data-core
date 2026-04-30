package gilberto.handlers;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import gilberto.Audit;
import gilberto.Db;
import gilberto.HttpUtil;
import gilberto.JsonUtil;
import gilberto.QueryUtil;
import gilberto.RequiredClientDocuments;
import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class DocumentsHandler implements HttpHandler {

  private static final String DOC_CORE_COLS =
      "id, org_id, client_id, requirement_key, provider_id, doc_name, doc_type, linked_name, upload_date, expiry_date, status, content_text, attachment_mime, attachment_filename";

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

  private static String rowJson ( ResultSet rs, boolean includeBlob ) throws SQLException {
    String b64Col = includeBlob ? rs.getString ( "attachment_base64" ) : null;
    boolean hasAtt =
        includeBlob
            ? !JsonUtil.blank ( b64Col )
            : rs.getInt ( "attachment_present" ) == 1;
    StringBuilder sb = new StringBuilder ();
    sb.append ( "{" )
        .append ( "\"id\":\"" ).append ( JsonUtil.esc ( rs.getString ( "id" ) ) ).append ( "\"," )
        .append ( "\"org_id\":" ).append ( JsonUtil.strOrNull ( rs.getString ( "org_id" ) ) ).append ( "," )
        .append ( "\"client_id\":" ).append ( JsonUtil.strOrNull ( rs.getString ( "client_id" ) ) ).append ( "," )
        .append ( "\"requirement_key\":" ).append ( JsonUtil.strOrNull ( rs.getString ( "requirement_key" ) ) ).append ( "," )
        .append ( "\"provider_id\":" ).append ( JsonUtil.strOrNull ( rs.getString ( "provider_id" ) ) ).append ( "," )
        .append ( "\"doc_name\":" ).append ( JsonUtil.strOrNull ( rs.getString ( "doc_name" ) ) ).append ( "," )
        .append ( "\"doc_type\":" ).append ( JsonUtil.strOrNull ( rs.getString ( "doc_type" ) ) ).append ( "," )
        .append ( "\"linked_name\":" ).append ( JsonUtil.strOrNull ( rs.getString ( "linked_name" ) ) ).append ( "," )
        .append ( "\"upload_date\":" ).append ( JsonUtil.strOrNull ( rs.getString ( "upload_date" ) ) ).append ( "," )
        .append ( "\"expiry_date\":" ).append ( JsonUtil.strOrNull ( rs.getString ( "expiry_date" ) ) ).append ( "," )
        .append ( "\"status\":" ).append ( JsonUtil.strOrNull ( rs.getString ( "status" ) ) ).append ( "," )
        .append ( "\"content_text\":" ).append ( JsonUtil.strOrNull ( rs.getString ( "content_text" ) ) ).append ( "," )
        .append ( "\"attachment_mime\":" ).append ( JsonUtil.strOrNull ( rs.getString ( "attachment_mime" ) ) ).append ( "," )
        .append ( "\"attachment_filename\":" ).append ( JsonUtil.strOrNull ( rs.getString ( "attachment_filename" ) ) ).append ( "," )
        .append ( "\"attachment_present\":" ).append ( hasAtt ? "true" : "false" ).append ( "," )
        .append ( "\"attachment_base64\":" );
    if ( includeBlob ) sb.append ( JsonUtil.strOrNull ( b64Col ) );
    else sb.append ( "null" );
    sb.append ( "}" );
    return sb.toString ();
  }

  private void get ( HttpExchange ex ) throws IOException {
    Map<String, String> q = HttpUtil.queryParams ( ex );
    String id = QueryUtil.eq ( q, "id" );
    String orgId = QueryUtil.eq ( q, "org_id" );
    String providerId = QueryUtil.eq ( q, "provider_id" );
    String status = QueryUtil.eq ( q, "status" );
    boolean includeBlob = !JsonUtil.blank ( id );

    String sql =
        "SELECT "
            + DOC_CORE_COLS
            + ( includeBlob
                ? ", attachment_base64"
                : ", CASE WHEN attachment_base64 IS NOT NULL AND LENGTH(attachment_base64) > 0 THEN 1 ELSE 0 END AS attachment_present" )
            + " FROM documents";
    List<String> where = new ArrayList<> ();
    List<String> vals = new ArrayList<> ();
    if ( !JsonUtil.blank ( id ) ) { where.add ( "id = ?" ); vals.add ( id ); }
    if ( !JsonUtil.blank ( orgId ) ) { where.add ( "org_id = ?" ); vals.add ( orgId ); }
    if ( !JsonUtil.blank ( providerId ) ) { where.add ( "provider_id = ?" ); vals.add ( providerId ); }
    if ( !JsonUtil.blank ( status ) ) { where.add ( "status = ?" ); vals.add ( status ); }
    if ( !where.isEmpty () ) sql += " WHERE " + String.join ( " AND ", where );
    sql += " ORDER BY upload_date DESC, id DESC LIMIT 500";

    try ( Connection c = Db.open (); PreparedStatement ps = c.prepareStatement ( sql ) ) {
      for ( int i = 0; i < vals.size (); i++ ) ps.setString ( i + 1, vals.get ( i ) );
      try ( ResultSet rs = ps.executeQuery () ) {
        List<String> rows = new ArrayList<> ();
        while ( rs.next () ) rows.add ( rowJson ( rs, includeBlob ) );
        HttpUtil.json ( ex, 200, "[" + String.join ( ",", rows ) + "]" );
      }
    } catch ( Exception e ) {
      HttpUtil.err ( ex, 500, "Failed to fetch documents" );
    }
  }

  private void post ( HttpExchange ex ) throws IOException {
    String b = HttpUtil.body ( ex );
    if ( "ensure_organization_requirements".equals ( JsonUtil.field ( b, "action" ) ) ) {
      ensureOrganizationDocuments ( ex, b );
      return;
    }
    String existingId = JsonUtil.field ( b, "id" );
    if ( !JsonUtil.blank ( existingId ) ) {
      updateDocument ( ex, b, existingId );
      return;
    }
    insertDocument ( ex, b );
  }

  private void ensureOrganizationDocuments ( HttpExchange ex, String b ) throws IOException {
    String orgId = JsonUtil.field ( b, "org_id" );
    if ( JsonUtil.blank ( orgId ) ) { HttpUtil.err ( ex, 400, "org_id is required" ); return; }
    try ( Connection c = Db.open () ) {
      RequiredClientDocuments.ensureOrganization ( c, orgId );
      Audit.log ( ex, "update", "documents", orgId, "ensure_requirements" );
      HttpUtil.json ( ex, 200, "{\"ok\":true}" );
    } catch ( Exception e ) {
      HttpUtil.err ( ex, 500, "Failed to ensure document requirements" );
    }
  }

  private void updateDocument ( HttpExchange ex, String b, String id ) throws IOException {
    String orgId = JsonUtil.field ( b, "org_id" );
    if ( JsonUtil.blank ( orgId ) ) { HttpUtil.err ( ex, 400, "org_id is required" ); return; }
    String name = JsonUtil.field ( b, "doc_name" );
    if ( JsonUtil.blank ( name ) ) { HttpUtil.err ( ex, 400, "doc_name is required" ); return; }
    String status = JsonUtil.field ( b, "status" );
    if ( JsonUtil.blank ( status ) ) status = "active";

    String attMime = JsonUtil.field ( b, "attachment_mime" );
    String attFn = JsonUtil.field ( b, "attachment_filename" );
    String attB64 = JsonUtil.field ( b, "attachment_base64" );
    boolean patchAtt = JsonUtil.hasField ( b, "attachment_base64" );

    String sql =
        "UPDATE documents SET doc_name = ?, doc_type = ?, linked_name = ?, upload_date = ?, expiry_date = ?, status = ?, content_text = ?, attachment_mime = ?, attachment_filename = ?, attachment_base64 = ?, client_id = ?, requirement_key = ?, provider_id = ? WHERE id = ? AND org_id = ?";
    try ( Connection c = Db.open () ) {
      if ( !patchAtt ) {
        try ( PreparedStatement prev = c.prepareStatement (
            "SELECT attachment_mime, attachment_filename, attachment_base64 FROM documents WHERE id = ? AND org_id = ?" ) ) {
          prev.setString ( 1, id );
          prev.setString ( 2, orgId );
          try ( ResultSet rs = prev.executeQuery () ) {
            if ( rs.next () ) {
              attMime = rs.getString ( "attachment_mime" );
              attFn = rs.getString ( "attachment_filename" );
              attB64 = rs.getString ( "attachment_base64" );
            }
          }
        }
      }
      try ( PreparedStatement ps = c.prepareStatement ( sql ) ) {
        ps.setString ( 1, name );
        ps.setString ( 2, JsonUtil.field ( b, "doc_type" ) );
        ps.setString ( 3, JsonUtil.field ( b, "linked_name" ) );
        ps.setString ( 4, JsonUtil.field ( b, "upload_date" ) );
        ps.setString ( 5, JsonUtil.field ( b, "expiry_date" ) );
        ps.setString ( 6, status );
        ps.setString ( 7, JsonUtil.field ( b, "content_text" ) );
        ps.setString ( 8, attMime );
        ps.setString ( 9, attFn );
        ps.setString ( 10, attB64 );
        ps.setString ( 11, JsonUtil.field ( b, "client_id" ) );
        ps.setString ( 12, JsonUtil.field ( b, "requirement_key" ) );
        ps.setString ( 13, JsonUtil.field ( b, "provider_id" ) );
        ps.setString ( 14, id );
        ps.setString ( 15, orgId );
        int n = ps.executeUpdate ();
        if ( n == 0 ) { HttpUtil.err ( ex, 404, "Document not found" ); return; }
      }
      Audit.log ( ex, "update", "documents", id, "success" );
      HttpUtil.json ( ex, 200, "[{\"id\":\"" + JsonUtil.esc ( id ) + "\"}]" );
    } catch ( Exception e ) {
      Audit.log ( ex, "update", "documents", id, "error" );
      HttpUtil.err ( ex, 500, "Failed to update document" );
    }
  }

  private void insertDocument ( HttpExchange ex, String b ) throws IOException {
    String name = JsonUtil.field ( b, "doc_name" );
    if ( JsonUtil.blank ( name ) ) { HttpUtil.err ( ex, 400, "doc_name is required" ); return; }
    String id = UUID.randomUUID ().toString ();
    String sql =
        "INSERT INTO documents (id, org_id, client_id, requirement_key, provider_id, doc_name, doc_type, linked_name, upload_date, expiry_date, status, content_text, attachment_mime, attachment_filename, attachment_base64) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    try ( Connection c = Db.open (); PreparedStatement ps = c.prepareStatement ( sql ) ) {
      ps.setString ( 1, id );
      ps.setString ( 2, JsonUtil.field ( b, "org_id" ) );
      ps.setString ( 3, JsonUtil.field ( b, "client_id" ) );
      ps.setString ( 4, JsonUtil.field ( b, "requirement_key" ) );
      ps.setString ( 5, JsonUtil.field ( b, "provider_id" ) );
      ps.setString ( 6, name );
      ps.setString ( 7, JsonUtil.field ( b, "doc_type" ) );
      ps.setString ( 8, JsonUtil.field ( b, "linked_name" ) );
      ps.setString ( 9, JsonUtil.field ( b, "upload_date" ) );
      ps.setString ( 10, JsonUtil.field ( b, "expiry_date" ) );
      String st = JsonUtil.field ( b, "status" );
      ps.setString ( 11, JsonUtil.blank ( st ) ? "active" : st );
      ps.setString ( 12, JsonUtil.field ( b, "content_text" ) );
      ps.setString ( 13, JsonUtil.field ( b, "attachment_mime" ) );
      ps.setString ( 14, JsonUtil.field ( b, "attachment_filename" ) );
      ps.setString ( 15, JsonUtil.field ( b, "attachment_base64" ) );
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
