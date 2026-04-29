package gilberto;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.UUID;

/**
 * HIPAA- and healthcare-style intake placeholders (submission order preserved).
 * Keys are stable identifiers; labels match the Documents page type picker.
 */
public final class RequiredClientDocuments {

  public static final String[][] SEEDS = new String[][] {
    { "01_hipaa_notice",          "HIPAA Notice acknowledgment" },
    { "02_roi",                   "Authorization for use/disclosure (ROI)" },
    { "03_consent_treatment",     "Consent for treatment and services" },
    { "04_npp_financial",         "Notice of Privacy Practices · financial acknowledgement" },
    { "05_rights_grievance",       "Client rights · grievances acknowledgment" },
    { "06_insurance",             "Insurance card · eligibility verification" },
    { "07_service_agreement",     "Service agreement · office policies" },
    { "08_emergency",             "Emergency contact · urgent care authorization" }
  };

  public static String linkedDisplayName ( String first, String last ) {
    return ( ( first == null ? "" : first ).trim () + " " + ( last == null ? "" : last ).trim () ).trim ();
  }

  /**
   * Idempotent inserts: skips if requirement_key row already exists for this client/org.
   */
  public static void seedForClient ( Connection c, String orgId, String clientId, String firstName, String lastName )
      throws Exception {
    if ( JsonUtil.blank ( orgId ) || JsonUtil.blank ( clientId ) ) return;
    String linked = linkedDisplayName ( firstName, lastName );
    for ( String[] row : SEEDS ) {
      String key = row[0];
      String typeLabel = row[1];
      try ( PreparedStatement ck = c.prepareStatement (
          "SELECT id FROM documents WHERE org_id = ? AND client_id = ? AND requirement_key = ? LIMIT 1" ) ) {
        ck.setString ( 1, orgId );
        ck.setString ( 2, clientId );
        ck.setString ( 3, key );
        try ( ResultSet rs = ck.executeQuery () ) {
          if ( rs.next () ) continue;
        }
      }
      String did = UUID.randomUUID ().toString ();
      try ( PreparedStatement ins = c.prepareStatement (
          "INSERT INTO documents (id, org_id, client_id, requirement_key, doc_name, doc_type, linked_name, status, content_text)"
          + " VALUES (?,?,?,?,?,?,?,?,?)" ) ) {
        ins.setString ( 1, did );
        ins.setString ( 2, orgId );
        ins.setString ( 3, clientId );
        ins.setString ( 4, key );
        ins.setString ( 5, typeLabel + " (required — awaiting upload)" );
        ins.setString ( 6, typeLabel );
        ins.setString ( 7, linked.isBlank () ? null : linked );
        ins.setString ( 8, "missing" );
        ins.setString ( 9, null );
        ins.executeUpdate ();
      }
    }
  }

  /** Backfill placeholders for active clients missing any requirement rows. */
  public static void ensureOrganization ( Connection c, String orgId ) throws Exception {
    if ( JsonUtil.blank ( orgId ) ) return;
    try ( PreparedStatement ps = c.prepareStatement (
        "SELECT id, first_name, last_name FROM clients WHERE org_id = ? AND status = 'active'" ) ) {
      ps.setString ( 1, orgId );
      try ( ResultSet rs = ps.executeQuery () ) {
        while ( rs.next () ) {
          seedForClient (
              c,
              orgId,
              rs.getString ( "id" ),
              rs.getString ( "first_name" ),
              rs.getString ( "last_name" )
          );
        }
      }
    }
  }

  private RequiredClientDocuments () {}
}
