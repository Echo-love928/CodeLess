import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.concurrent.*;
public class TransportProbe {
  public static void main(String[] args) throws Exception {
    for (var version : new HttpClient.Version[]{HttpClient.Version.HTTP_2, HttpClient.Version.HTTP_1_1}) {
      long start=System.nanoTime();
      try (var client=HttpClient.newBuilder().version(version).followRedirects(HttpClient.Redirect.NEVER).connectTimeout(Duration.ofSeconds(10)).build()) {
        var request=HttpRequest.newBuilder(URI.create("https://api.deepseek.com/chat/completions")).timeout(Duration.ofSeconds(15)).header("Content-Type","application/json")
          .POST(HttpRequest.BodyPublishers.ofString("{\"model\":\"diagnostic-unauthenticated\",\"messages\":[{\"role\":\"user\",\"content\":\""+"x".repeat(6500)+"\"}],\"max_tokens\":256}")).build();
        try {
          var response=client.sendAsync(request,HttpResponse.BodyHandlers.discarding()).get(16,TimeUnit.SECONDS);
          System.out.println("requested="+version+" received="+response.version()+" status="+response.statusCode()+" elapsedMs="+(System.nanoTime()-start)/1000000);
        } catch(Exception exception) {
          System.out.print("requested="+version+" elapsedMs="+(System.nanoTime()-start)/1000000+" exceptionClasses=");
          for(Throwable cause=exception;cause!=null;cause=cause.getCause()) System.out.print(cause.getClass().getName()+" ");
          System.out.println();
        }
      }
    }
  }
}
