package io.github.jdial1.infiniterts

import io.github.jdial1.infiniterts.model.CssColor
import org.junit.Assert.assertEquals
import org.junit.Test

class CssColorTest {
    @Test fun parsesTheFormatsTheServerSends() {
        assertEquals(0xFFFF0000, CssColor.parse("hsl(0, 100%, 50%)"))
        assertEquals(0xFF0000FF, CssColor.parse("hsl(240, 100%, 50%)"))
        assertEquals(0xFF38BDF8, CssColor.parse("#38bdf8"))
        assertEquals(0xFFFF0000, CssColor.parse("#f00"))
        assertEquals(0xFFFFFFFF, CssColor.parse("not a colour"))
        // The server's generated colours: hsl(<random>, 80%, 60%)
        assertEquals(0xFFEB4747, CssColor.parse("hsl(0, 80%, 60%)"))
    }
}
