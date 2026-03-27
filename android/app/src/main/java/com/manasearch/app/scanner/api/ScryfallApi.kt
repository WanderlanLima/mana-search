package com.manasearch.app.scanner.api

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import retrofit2.http.GET
import retrofit2.http.Query
import okhttp3.OkHttpClient

@JsonClass(generateAdapter = false)
data class ScryfallCard(
    val name: String,
    val set: String,
    @Json(name = "mana_cost") val manaCost: String?,
    @Json(name = "oracle_text") val oracleText: String?,
    val prices: Map<String, String?>?
)

interface ScryfallApi {
    @GET("cards/{id}")
    suspend fun getCardById(@retrofit2.http.Path("id") cardId: String): ScryfallCard

    @GET("cards/named")
    suspend fun getCardFuzzy(@Query("fuzzy") cardName: String): ScryfallCard
}

object RetrofitClient {
    private val moshi = com.squareup.moshi.Moshi.Builder()
        .addLast(com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory())
        .build()

    private val client = OkHttpClient.Builder().addInterceptor { chain ->
        val original = chain.request()
        val request = original.newBuilder()
            .header("User-Agent", "ManaSearch/1.0")
            .header("Accept", "application/json")
            .method(original.method, original.body)
            .build()
        chain.proceed(request)
    }.build()

    val api: ScryfallApi by lazy {
        Retrofit.Builder()
            .baseUrl("https://api.scryfall.com/")
            .client(client)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
            .create(ScryfallApi::class.java)
    }
}
