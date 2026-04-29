package gilberto;

public final class Env {

  public static final String DB_URL  = strOrDefault ( "DB_URL",  "jdbc:mysql://localhost:3306/gilberto_crm" );
  public static final String DB_USER = strOrDefault ( "DB_USER", "root" );
  public static final String DB_PASS = strOrDefault ( "DB_PASS", "root" );
  public static final String ALLOWED_ORIGIN = strOrDefault ( "ALLOWED_ORIGIN", "*" );
  public static final String API_KEY = strOrDefault ( "API_KEY", "" );
  public static final int MAX_BODY_BYTES = intOrDefault ( "MAX_BODY_BYTES", 131072 );

  public static int intOrDefault ( String key, int fallback ) {
    try {
      String s = System.getenv ( key );
      return s != null ? Integer.parseInt ( s ) : fallback;
    } catch ( Exception e ) {
      return fallback;
    }
  }

  public static String strOrDefault ( String key, String fallback ) {
    String s = System.getenv ( key );
    return ( s == null || s.isBlank () ) ? fallback : s.strip ();
  }

  public static boolean hasApiKey () {
    return API_KEY != null && !API_KEY.isBlank ();
  }

  private Env () {}
}
