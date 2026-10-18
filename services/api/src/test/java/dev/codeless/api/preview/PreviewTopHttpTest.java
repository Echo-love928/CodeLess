package dev.codeless.api.preview;

import org.springframework.test.context.TestPropertySource;
import org.springframework.test.annotation.DirtiesContext;

/** Original real-session/SQL/CSRF/ownership/immutable-version assertions on .top. */
@TestPropertySource(properties = {
    "CODELESS_PREVIEW_ORIGIN=https://preview.codeless-preview.top",
    "CODELESS_PLATFORM_ORIGIN=https://app.codeless-platform.top"
})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class PreviewTopHttpTest extends PreviewHttpTest {}
