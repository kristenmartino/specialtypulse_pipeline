FROM apache/airflow:3.1.8-python3.11
RUN pip install --no-cache-dir apache-airflow==3.1.8 databricks-sdk==0.157.0 requests==2.32.5 chardet==5.2.0
COPY --chown=airflow:root deployment /opt/specialtypulse/deployment
COPY --chown=airflow:root airflow/dags /opt/airflow/dags
ENV PYTHONPATH=/opt/specialtypulse
