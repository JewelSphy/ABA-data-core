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

public final class ProfileHandler implements HttpHandler {

  @Override
  public void handle ( HttpExchange ex ) throws IOException {
    if ( HttpUtil.preflight ( ex ) ) return;
    if ( !HttpUtil.requireApiKey ( ex ) ) { Audit.log ( ex, "auth_failed", "profile", null, "denied" ); return; }
    String m = ex.getRequestMethod ();
    if ( "GET".equalsIgnoreCase ( m ) ) { get ( ex ); return; }
    if ( "POST".equalsIgnoreCase ( m ) ) { post ( ex ); return; }
    HttpUtil.err ( ex, 405, "Method not allowed" );
  }

  private void get ( HttpExchange ex ) throws IOException {
    Map<String, String> q = HttpUtil.queryParams ( ex );
    String orgId = QueryUtil.eq ( q, "org_id" );
    String userKey = QueryUtil.eq ( q, "user_key" );
    if ( JsonUtil.blank ( orgId ) || JsonUtil.blank ( userKey ) ) {
      HttpUtil.err ( ex, 400, "org_id=eq.<id> and user_key=eq.<key> are required" );
      return;
    }

    String sql = Db.readSql ( "sql/profile/select.sql" );
    if ( JsonUtil.blank ( sql ) ) { HttpUtil.err ( ex, 500, "Missing sql/profile/select.sql" ); return; }
    sql += " WHERE org_id = ? AND user_key = ? LIMIT 1";

    try ( Connection c = Db.open (); PreparedStatement ps = c.prepareStatement ( sql ) ) {
      ps.setString ( 1, orgId );
      ps.setString ( 2, userKey );
      try ( ResultSet rs = ps.executeQuery () ) {
        List<String> rows = new ArrayList<> ();
        while ( rs.next () ) {
          rows.add ( "{"
            + "\"id\":\"" + JsonUtil.esc ( rs.getString ( "id" ) ) + "\","
            + "\"org_id\":" + JsonUtil.strOrNull ( rs.getString ( "org_id" ) ) + ","
            + "\"user_key\":" + JsonUtil.strOrNull ( rs.getString ( "user_key" ) ) + ","
            + "\"full_name\":" + JsonUtil.strOrNull ( rs.getString ( "full_name" ) ) + ","
            + "\"email\":" + JsonUtil.strOrNull ( rs.getString ( "email" ) ) + ","
            + "\"role_title\":" + JsonUtil.strOrNull ( rs.getString ( "role_title" ) ) + ","
            + "\"phone\":" + JsonUtil.strOrNull ( rs.getString ( "phone" ) ) + ","
            + "\"bio\":" + JsonUtil.strOrNull ( rs.getString ( "bio" ) ) + ","
            + "\"avatar_initial\":" + JsonUtil.strOrNull ( rs.getString ( "avatar_initial" ) )
            + "}" );
        }
        HttpUtil.json ( ex, 200, "[" + String.join ( ",", rows ) + "]" );
      }
    } catch ( Exception e ) {
      HttpUtil.err ( ex, 500, "Failed to fetch profile" );
    }
  }

  private void post ( HttpExchange ex ) throws IOException {
    String b = HttpUtil.body ( ex );
    String orgId = JsonUtil.field ( b, "org_id" );
    String userKey = JsonUtil.field ( b, "user_key" );
    if ( JsonUtil.blank ( orgId ) || JsonUtil.blank ( userKey ) ) {
      HttpUtil.err ( ex, 400, "org_id and user_key are required" );
      return;
    }
    String sql = Db.readSql ( "sql/profile/upsert.sql" );
    if ( JsonUtil.blank ( sql ) ) { HttpUtil.err ( ex, 500, "Missing sql/profile/upsert.sql" ); return; }
    try ( Connection c = Db.open (); PreparedStatement ps = c.prepareStatement ( sql ) ) {
      ps.setString ( 1, UUID.randomUUID ().toString () );
      ps.setString ( 2, orgId );
      ps.setString ( 3, userKey );
      ps.setString ( 4, JsonUtil.field ( b, "full_name" ) );
      ps.setString ( 5, JsonUtil.field ( b, "email" ) );
      ps.setString ( 6, JsonUtil.field ( b, "role_title" ) );
      ps.setString ( 7, JsonUtil.field ( b, "phone" ) );
      ps.setString ( 8, JsonUtil.field ( b, "bio" ) );
      ps.setString ( 9, JsonUtil.field ( b, "avatar_initial" ) );
      ps.executeUpdate ();
      Audit.log ( ex, "upsert", "profile", userKey, "success" );
      HttpUtil.json ( ex, 201, "{\"ok\":true}" );
    } catch ( Exception e ) {
      Audit.log ( ex, "upsert", "profile", userKey, "error" );
      HttpUtil.err ( ex, 500, "Failed to save profile" );
    }
  }
}
