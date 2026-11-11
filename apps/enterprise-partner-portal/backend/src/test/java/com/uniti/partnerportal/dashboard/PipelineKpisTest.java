package com.uniti.partnerportal.dashboard;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class PipelineKpisTest {

    @Test
    void rateIsNullWhenNothingHasClosed() {
        assertThat(PipelineKpis.rate(0, 0)).isNull();
    }

    @Test
    void rateRoundsHalfEvenToOneDecimal() {
        assertThat(PipelineKpis.rate(1, 2)).isEqualByComparingTo("33.3");
        assertThat(PipelineKpis.rate(2, 1)).isEqualByComparingTo("66.7");
        assertThat(PipelineKpis.rate(5, 0)).isEqualByComparingTo("100.0");
    }
}
