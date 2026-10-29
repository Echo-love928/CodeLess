package dev.codeless.api.auth;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

class ApiRequestBodyTest {
    @Test void declaredOversizeDoesNotOpenOrReadTheBody() throws Exception {
        var request = mock(HttpServletRequest.class);
        when(request.getContentLengthLong()).thenReturn((long) ApiRequestBody.MAX_BYTES + 1);
        assertThatThrownBy(() -> ApiRequestBody.bounded(request)).isInstanceOf(ApiRequestBody.TooLarge.class);
        verify(request, never()).getInputStream();
    }

    @Test void unknownLengthAndUnderdeclaredBodiesReadAtMostLimitPlusOne() throws Exception {
        for (long declared : new long[]{-1, 8}) {
            var request = mock(HttpServletRequest.class);
            var stream = new CountingStream();
            when(request.getContentLengthLong()).thenReturn(declared);
            when(request.getInputStream()).thenReturn(stream);
            assertThatThrownBy(() -> ApiRequestBody.bounded(request)).isInstanceOf(ApiRequestBody.TooLarge.class);
            assertThat(stream.read).isEqualTo(ApiRequestBody.MAX_BYTES + 1);
        }
    }

    @Test void unicodeReaderAndEmptyStreamStillWork() throws Exception {
        var request = new MockHttpServletRequest();
        request.setCharacterEncoding("UTF-8");
        request.setContent("你好😀".getBytes(StandardCharsets.UTF_8));
        assertThat(ApiRequestBody.bounded(request).getReader().readLine()).isEqualTo("你好😀");
        request.setContent(new byte[0]);
        var input = ApiRequestBody.bounded(request).getInputStream();
        assertThat(input.isReady()).isTrue();
        assertThat(input.isFinished()).isTrue();
        assertThat(input.read()).isEqualTo(-1);
    }

    @Test void transportReadFailureCannotInvokeAHandler() throws Exception {
        var request = mock(HttpServletRequest.class);
        when(request.getContentLengthLong()).thenReturn(-1L);
        when(request.getInputStream()).thenThrow(new IOException("fixture-disconnect"));
        assertThatThrownBy(() -> ApiRequestBody.bounded(request)).isInstanceOf(IOException.class)
                .hasMessage("fixture-disconnect");
    }

    private static final class CountingStream extends ServletInputStream {
        int read;
        @Override public int read() { read++; return ' '; }
        @Override public int read(byte[] b, int off, int len) {
            java.util.Arrays.fill(b, off, off + len, (byte) ' ');
            read += len;
            return len;
        }
        @Override public boolean isFinished() { return false; }
        @Override public boolean isReady() { return true; }
        @Override public void setReadListener(ReadListener listener) { throw new UnsupportedOperationException(); }
    }
}
