package gilberto;

public final class JsonUtil {

  public static String esc ( String s ) {
    if ( s == null ) return "";
    return s.replace ( "\\", "\\\\" ).replace ( "\"", "\\\"" );
  }

  public static String strOrNull ( String s ) {
    return s == null ? "null" : "\"" + esc ( s ) + "\"";
  }

  // Minimal parser for flat JSON string fields used by frontend payloads.
  public static String field ( String json, String key ) {
    if ( json == null ) return null;
    String k = "\"" + key + "\"";
    int p = json.indexOf ( k );
    if ( p < 0 ) return null;
    int c = json.indexOf ( ':', p + k.length () );
    if ( c < 0 ) return null;
    int i = c + 1;
    while ( i < json.length () && Character.isWhitespace ( json.charAt ( i ) ) ) i++;
    if ( i >= json.length () ) return null;

    // null literal
    if ( json.startsWith ( "null", i ) ) return null;

    // quoted string
    if ( json.charAt ( i ) == '"' ) {
      i++;
      StringBuilder out = new StringBuilder ();
      boolean esc = false;
      while ( i < json.length () ) {
        char ch = json.charAt ( i++ );
        if ( esc ) {
          out.append ( ch );
          esc = false;
          continue;
        }
        if ( ch == '\\' ) {
          esc = true;
          continue;
        }
        if ( ch == '"' ) return out.toString ();
        out.append ( ch );
      }
      return out.toString ();
    }

    // bare token (number/boolean) until comma or object end
    int j = i;
    while ( j < json.length () && json.charAt ( j ) != ',' && json.charAt ( j ) != '}' ) j++;
    String token = json.substring ( i, j ).strip ();
    return token.isEmpty () ? null : token;
  }

  public static boolean blank ( String s ) {
    return s == null || s.isBlank ();
  }

  /** True if JSON contains a top-level quoted key (flat payloads only). */
  public static boolean hasField ( String json, String key ) {
    if ( json == null || key == null || key.isBlank () ) return false;
    return json.indexOf ( "\"" + key + "\"" ) >= 0;
  }

  private JsonUtil () {}
}
