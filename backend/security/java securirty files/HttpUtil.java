package gilberto;

import com.sun.net.httpserver.HttpExchange;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.HashMap;
import java.util.Map;

public final class HttpUtil {

  public static boolean preflight ( HttpExchange ex ) throws IOException {
    addCors ( ex );
    addSecurityHeaders ( ex );
    if ( !originAllowed ( ex ) ) {
      err ( ex, 403, "Origin not allowed" );
      return true;
    }
    if ( "OPTIONS".equalsIgnoreCase ( ex.getRequestMethod () ) ) {
      ex.sendResponseHeaders ( 204, -1 );
      return true;
    }
    return false;
  }

  public static void addCors ( HttpExchange ex ) {
    String allowed = Env.ALLOWED_ORIGIN;
    String reqOrigin = ex.getRequestHeaders ().getFirst ( "Origin" );
    String originToSet = "*";
    if ( allowed != null && !allowed.isBlank () && !"*".equals ( allowed ) ) {
      originToSet = allowed;
    } else if ( reqOrigin != null && !reqOrigin.isBlank () ) {
      originToSet = reqOrigin;
    }
    ex.getResponseHeaders ().set ( "Access-Control-Allow-Origin", originToSet );
    ex.getResponseHeaders ().set ( "Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS" );
    ex.getResponseHeaders ().set ( "Access-Control-Allow-Headers", "content-type, authorization, apikey, prefer, x-api-key, x-user-name, x-user-id" );
    ex.getResponseHeaders ().set ( "Vary", "Origin" );
  }

  public static void addSecurityHeaders ( HttpExchange ex ) {
    ex.getResponseHeaders ().set ( "X-Content-Type-Options", "nosniff" );
    ex.getResponseHeaders ().set ( "X-Frame-Options", "DENY" );
    ex.getResponseHeaders ().set ( "Referrer-Policy", "no-referrer" );
    ex.getResponseHeaders ().set ( "Cache-Control", "no-store" );
  }

  public static void json ( HttpExchange ex, int code, String body ) throws IOException {
    byte[] b = body.getBytes ( StandardCharsets.UTF_8 );
    addSecurityHeaders ( ex );
    ex.getResponseHeaders ().set ( "Content-Type", "application/json; charset=UTF-8" );
    ex.sendResponseHeaders ( code, b.length );
    try ( OutputStream os = ex.getResponseBody () ) { os.write ( b ); }
  }

  public static void err ( HttpExchange ex, int code, String msg ) throws IOException {
    json ( ex, code, "{\"error\":\"" + JsonUtil.esc ( msg ) + "\"}" );
  }

  public static String body ( HttpExchange ex ) throws IOException {
    try ( InputStream in = ex.getRequestBody () ) {
      int max = Math.max ( 1024, Env.MAX_BODY_BYTES );
      byte[] buf = new byte[8192];
      int n;
      int total = 0;
      java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream ();
      while ( ( n = in.read ( buf ) ) >= 0 ) {
        total += n;
        if ( total > max ) throw new IOException ( "Request body too large" );
        out.write ( buf, 0, n );
      }
      return out.toString ( StandardCharsets.UTF_8 );
    }
  }

  public static boolean requireApiKey ( HttpExchange ex ) throws IOException {
    if ( !Env.hasApiKey () ) return true;
    String k1 = ex.getRequestHeaders ().getFirst ( "x-api-key" );
    String k2 = ex.getRequestHeaders ().getFirst ( "apikey" );
    String auth = ex.getRequestHeaders ().getFirst ( "Authorization" );
    String bearer = ( auth != null && auth.toLowerCase ().startsWith ( "bearer " ) ) ? auth.substring ( 7 ).trim () : null;
    if ( equalsAny ( Env.API_KEY, k1, k2, bearer ) ) return true;
    err ( ex, 401, "Unauthorized" );
    return false;
  }

  private static boolean equalsAny ( String expected, String... values ) {
    for ( String v : values ) if ( v != null && expected.equals ( v ) ) return true;
    return false;
  }

  public static boolean originAllowed ( HttpExchange ex ) {
    String allowed = Env.ALLOWED_ORIGIN;
    if ( allowed == null || allowed.isBlank () || "*".equals ( allowed ) ) return true;
    String req = ex.getRequestHeaders ().getFirst ( "Origin" );
    if ( req == null || req.isBlank () ) return true;
    return allowed.equals ( req );
  }

  public static Map<String, String> queryParams ( HttpExchange ex ) {
    String q = ex.getRequestURI ().getRawQuery ();
    Map<String, String> m = new HashMap<> ();
    if ( q == null || q.isBlank () ) return m;
    for ( String p : q.split ( "&" ) ) {
      int i = p.indexOf ( '=' );
      if ( i <= 0 ) continue;
      m.put ( decode ( p.substring ( 0, i ) ), decode ( p.substring ( i + 1 ) ) );
    }
    return m;
  }

  private static String decode ( String s ) {
    try { return java.net.URLDecoder.decode ( s, StandardCharsets.UTF_8 ); }
    catch ( Exception e ) { return s; }
  }

  private HttpUtil () {}
}
