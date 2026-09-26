package io.github.jdial1.infiniterts.auth

import android.content.Context
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.GoogleAuthProvider
import io.github.jdial1.infiniterts.R
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

/** Who is playing: a Google account through Firebase Auth, or (debug builds against a local server) a guest. */
sealed interface Session {
    val uid: String
    val displayName: String?

    data class Google(override val uid: String, override val displayName: String?) : Session
    data class Guest(override val uid: String) : Session {
        override val displayName: String? get() = null
    }
}

class AuthRepository(private val appContext: Context) {
    private val auth = FirebaseAuth.getInstance()

    /** The signed-in Google session, or null, now and whenever it changes. */
    val googleSession: Flow<Session.Google?> = callbackFlow {
        val listener = FirebaseAuth.AuthStateListener { fa ->
            trySend(fa.currentUser?.let { Session.Google(it.uid, it.displayName) })
        }
        auth.addAuthStateListener(listener)
        awaitClose { auth.removeAuthStateListener(listener) }
    }

    /**
     * Shows Google's account picker, then signs in to Firebase with the chosen account.
     * [activityContext] must be an Activity: Credential Manager draws its UI over it.
     */
    suspend fun signInWithGoogle(activityContext: Context) {
        val option = GetSignInWithGoogleOption.Builder(
            // The project's web client ID, generated from google-services.json by the Google Services plugin
            appContext.getString(R.string.default_web_client_id),
        ).build()
        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
        val result = CredentialManager.create(activityContext).getCredential(activityContext, request)
        val credential = result.credential
        require(credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
            "Unexpected credential type"
        }
        val google = GoogleIdTokenCredential.createFrom(credential.data)
        auth.signInWithCredential(GoogleAuthProvider.getCredential(google.idToken, null)).await()
    }

    /** A Firebase ID token for the game server; [forceRefresh] after the server rejects one. */
    suspend fun idToken(forceRefresh: Boolean = false): String? =
        auth.currentUser?.getIdToken(forceRefresh)?.await()?.token

    suspend fun signOut() {
        auth.signOut()
        // Forget the chosen account too, so the picker shows next time
        runCatching { CredentialManager.create(appContext).clearCredentialState(ClearCredentialStateRequest()) }
    }
}
