package com.uniti.qa.data;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.Map;
import org.testng.annotations.DataProvider;

/**
 * TestNG data providers. Tabular scenarios live as JSON under {@code src/test/resources/testdata}
 * so non-developers can extend them without touching Java.
 */
public final class TestDataProviders {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private TestDataProviders() {
    }

    static <T> List<T> readJson(String resource, TypeReference<List<T>> type) {
        try (InputStream in = TestDataProviders.class.getClassLoader().getResourceAsStream(resource)) {
            if (in == null) {
                throw new IllegalStateException("Test data resource not found: " + resource);
            }
            return MAPPER.readValue(in, type);
        } catch (IOException e) {
            throw new IllegalStateException("Unable to parse " + resource, e);
        }
    }

    /** Valid deal shapes across product mixes and site counts. */
    @DataProvider(name = "validDeals", parallel = true)
    public static Object[][] validDeals() {
        List<Map<String, Object>> rows = readJson("testdata/deals-valid.json", new TypeReference<>() { });
        Object[][] data = new Object[rows.size()][];
        for (int i = 0; i < rows.size(); i++) {
            Map<String, Object> row = rows.get(i);
            int sites = ((Number) row.get("sites")).intValue();
            long monthlyValueMinor = ((Number) row.get("monthlyValueMinor")).longValue();
            DealData deal = DealData.unique(castList(row.get("products")), sites, monthlyValueMinor);
            data[i] = new Object[] { row.get("scenario"), deal };
        }
        return data;
    }

    /** Invalid customer step inputs paired with the field expected to be flagged. */
    @DataProvider(name = "invalidDealCustomer")
    public static Object[][] invalidDealCustomer() {
        List<Map<String, String>> rows = readJson("testdata/deals-invalid-customer.json", new TypeReference<>() { });
        Object[][] data = new Object[rows.size()][];
        for (int i = 0; i < rows.size(); i++) {
            Map<String, String> row = rows.get(i);
            data[i] = new Object[] { row.get("scenario"), row.get("customerName"), row.get("customerDomain"),
                    row.get("contactEmail"), row.get("invalidField") };
        }
        return data;
    }

    /** Invite inputs for Uconnect user management and the expected outcome. */
    @DataProvider(name = "userInvites")
    public static Object[][] userInvites() {
        return new Object[][] {
                { "business user", "BUSINESS_USER", true, null },
                { "second admin", "BUSINESS_ADMIN", true, null },
                { "malformed email", "BUSINESS_USER", false, "Enter a valid email address" },
        };
    }

    @SuppressWarnings("unchecked")
    private static List<String> castList(Object value) {
        return (List<String>) value;
    }
}
