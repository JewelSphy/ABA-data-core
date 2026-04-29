package gilberto;

import java.util.Map;

public final class QueryUtil {

  // supports params like id=eq.<value> or org_id=eq.<value>
  public static String eq ( Map<String, String> q, String key ) {
    String v = q.get ( key );
    if ( v == null ) return null;
    if ( v.startsWith ( "eq." ) ) return v.substring ( 3 );
    return v;
  }

  public static int intOrDefault ( Map<String, String> q, String key, int fallback ) {
    try {
      String v = q.get ( key );
      return v != null ? Integer.parseInt ( v ) : fallback;
    } catch ( Exception e ) {
      return fallback;
    }
  }

  private QueryUtil () {}
}
