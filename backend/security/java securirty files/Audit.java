package gilberto;

import com.sun.net.httpserver.HttpExchange;
import java.sql.Connection;
import java.sql.PreparedStatement;

public final class Audit {
  public static void log ( HttpExchange ex, String action, String entityType, String entityId, String outcome ) {
    String sql = "INSERT INTO audit_logs (id, actor, action, entity_type, entity_id, outcome, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
    try ( Connection c = Db.open (); PreparedStatement ps = c.prepareStatement ( sql ) ) {
      ps.setString ( 1, java.util.UUID.randomUUID ().toString () );
      ps.setString ( 2, actor ( ex ) );
      ps.setString ( 3, action );
      ps.setString ( 4, entityType );
      ps.setString ( 5, entityId );
      ps.setString ( 6, outcome );
      ps.setString ( 7, clientIp ( ex ) );
      ps.setString ( 8, ex.getRequestHeaders ().getFirst ( "User-Agent" ) );
      ps.executeUpdate ();
    } catch ( Exception ignored ) {
      // Keep request path fast/fault-tolerant; failed audits should not break user actions.
    }
  }

  public static String actor ( HttpExchange ex ) {
    String byName = ex.getRequestHeaders ().getFirst ( "X-User-Name" );
    if ( byName != null && !byName.isBlank () ) return byName.trim ();
    String byId = ex.getRequestHeaders ().getFirst ( "X-User-Id" );
    if ( byId != null && !byId.isBlank () ) return byId.trim ();
    return "unknown";
  }

  private static String clientIp ( HttpExchange ex ) {
    String fwd = ex.getRequestHeaders ().getFirst ( "X-Forwarded-For" );
    if ( fwd != null && !fwd.isBlank () ) return fwd.split ( "," )[0].trim ();
    return ex.getRemoteAddress () != null ? ex.getRemoteAddress ().toString () : "unknown";
  }

  private Audit () {}
}
