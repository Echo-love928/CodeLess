import java.net.*;
import java.net.http.*;
import java.security.MessageDigest;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.TimeUnit;
import javax.naming.ldap.LdapName;

/** Fixed endpoint, unauthenticated synthetic data, default TLS validation; never reads provider credentials. */
public class NetworkEnvironmentProbe {
    private static final URI ENDPOINT=URI.create("https://api.deepseek.com/chat/completions");
    private static String quoted(String value) {return "\""+value.replace("\\","\\\\").replace("\"","\\\"").replace("\r","").replace("\n","")+"\"";}
    private static String cn(javax.security.auth.x500.X500Principal principal) throws Exception {
        for(var field:new LdapName(principal.getName()).getRdns())if(field.getType().equalsIgnoreCase("CN"))return field.getValue().toString();
        return "CN_ABSENT";
    }
    public static void main(String[] args) throws Exception {
        var dns=Arrays.stream(InetAddress.getAllByName(ENDPOINT.getHost())).map(a->quoted(a.getHostAddress())).toList();
        var selector=ProxySelector.getDefault();
        var selected=selector==null?List.of(Proxy.NO_PROXY):selector.select(ENDPOINT);
        System.out.println("{\"kind\":\"environment\",\"java\":"+quoted(System.getProperty("java.runtime.version"))
                +",\"dns\":["+String.join(",",dns)+"],\"defaultProxySelector\":"+quoted(selector==null?"NONE":selector.getClass().getName())
                +",\"selectedProxy\":"+quoted(selected.toString())+",\"useSystemProxies\":"+quoted(System.getProperty("java.net.useSystemProxies","false"))
                +",\"customTrustStore\":"+(System.getProperty("javax.net.ssl.trustStore")!=null)+",\"credentialsUsed\":false,\"modelCalls\":0}");
        for(String route:List.of("DEFAULT","EXPLICIT_LOOPBACK_PROXY"))for(var version:HttpClient.Version.values()) {
            long start=System.nanoTime();var builder=HttpClient.newBuilder().version(version).followRedirects(HttpClient.Redirect.NEVER).connectTimeout(Duration.ofSeconds(10));
            if(route.equals("EXPLICIT_LOOPBACK_PROXY"))builder.proxy(ProxySelector.of(new InetSocketAddress("127.0.0.1",7897)));
            try(var client=builder.build()) {
                var request=HttpRequest.newBuilder(ENDPOINT).timeout(Duration.ofSeconds(15)).header("Content-Type","application/json")
                        .POST(HttpRequest.BodyPublishers.ofString("{\"model\":\"diagnostic-unauthenticated\",\"messages\":[{\"role\":\"user\",\"content\":\""+"x".repeat(6500)+"\"}],\"max_tokens\":256}")).build();
                try {
                    var response=client.sendAsync(request,HttpResponse.BodyHandlers.discarding()).get(16,TimeUnit.SECONDS);
                    var chain=new ArrayList<String>();
                    if(response.sslSession().isPresent())for(var certificate:response.sslSession().orElseThrow().getPeerCertificates()) {
                        var cert=(X509Certificate)certificate;
                        chain.add("{\"subjectCN\":"+quoted(cn(cert.getSubjectX500Principal()))+",\"issuerCN\":"+quoted(cn(cert.getIssuerX500Principal()))
                                +",\"sha256\":"+quoted(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(cert.getEncoded())))+"}");
                    }
                    System.out.println("{\"kind\":\"transport\",\"route\":"+quoted(route)+",\"requestedProtocol\":"+quoted(version.name())+",\"receivedProtocol\":"+quoted(response.version().name())
                            +",\"status\":"+response.statusCode()+",\"elapsedMs\":"+(System.nanoTime()-start)/1000000+",\"defaultTlsValidated\":"+response.sslSession().isPresent()+",\"peerChain\":["+String.join(",",chain)+"]}");
                } catch(Exception error) {
                    var classes=new ArrayList<String>();for(Throwable cause=error;cause!=null;cause=cause.getCause())classes.add(quoted(cause.getClass().getName()));
                    System.out.println("{\"kind\":\"transport\",\"route\":"+quoted(route)+",\"requestedProtocol\":"+quoted(version.name())+",\"elapsedMs\":"+(System.nanoTime()-start)/1000000+",\"exceptionClasses\":["+String.join(",",classes)+"]}");
                }
            }
        }
    }
}
