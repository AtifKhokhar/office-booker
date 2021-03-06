import { Config, OfficeQuota } from '../app-config';
import DynamoDB from 'aws-sdk/clients/dynamodb';
import { attribute, table, hashKey, rangeKey } from '@aws/dynamodb-data-mapper-annotations';
import { DataMapper } from '@aws/dynamodb-data-mapper';
import { ConditionExpression } from '@aws/dynamodb-expressions';
import { Arrays } from 'collection-fns';

import {
  AttributePath,
  ExpressionAttributes,
  MathematicalExpression,
  UpdateExpression,
  FunctionExpression,
} from '@aws/dynamodb-expressions';
import { addDays, getUnixTime } from 'date-fns';

export interface OfficeBooking {
  officeId: string;
  date: string;
  bookingCount: number;
  parkingCount: number;
}

@table('office-bookings')
export class OfficeBookingModel {
  /** This is still called name, but now contains the officeId since version 3 */
  @hashKey()
  name!: string;
  @rangeKey()
  date!: string;
  @attribute()
  bookingCount!: number;
  @attribute()
  parkingCount!: number;
  @attribute()
  ttl!: number;
}

const buildMapper = (config: Config) =>
  new DataMapper({
    client: new DynamoDB(config.dynamoDB),
    tableNamePrefix: config.dynamoDBTablePrefix,
  });

export const incrementOfficeBookingCount = async (
  config: Config,
  office: OfficeQuota,
  date: string,
  includeParking: boolean
) => {
  const mapper = buildMapper(config);

  try {
    await mapper.put(
      Object.assign(new OfficeBookingModel(), {
        name: office.id,
        date,
        bookingCount: 0,
        parkingCount: 0,
        ttl: getUnixTime(addDays(new Date(date), config.dataRetentionDays)),
      }),
      {
        condition: {
          type: 'And',
          conditions: [
            new FunctionExpression('attribute_not_exists', new AttributePath('name')),
            new FunctionExpression('attribute_not_exists', new AttributePath('date')),
          ],
        },
      }
    );
  } catch (err) {
    if (err.code !== 'ConditionalCheckFailedException') {
      throw err;
    }
  }

  const attributes = new ExpressionAttributes();
  const updateExpression = new UpdateExpression();
  updateExpression.set(
    'bookingCount',
    new MathematicalExpression(new AttributePath('bookingCount'), '+', 1)
  );

  let parkingQuotaValue;

  if (includeParking) {
    updateExpression.set(
      'parkingCount',
      new MathematicalExpression(new AttributePath('parkingCount'), '+', 1)
    );
    parkingQuotaValue = attributes.addValue(office.parkingQuota);
  }

  const quotaValue = attributes.addValue(office.quota);
  const client = new DynamoDB(config.dynamoDB);
  try {
    const checkParkingQuota = includeParking ? `AND parkingCount < ${parkingQuotaValue}` : '';
    await client
      .updateItem({
        Key: { name: { S: office.id }, date: { S: date } },
        TableName: (config.dynamoDBTablePrefix || '') + 'office-bookings',
        UpdateExpression: updateExpression.serialize(attributes),
        ExpressionAttributeNames: attributes.names,
        ExpressionAttributeValues: attributes.values,
        ConditionExpression: `bookingCount < ${quotaValue} ${checkParkingQuota}`,
      })
      .promise();
  } catch (err) {
    if (err.code === 'ConditionalCheckFailedException') {
      return false;
    } else {
      throw err;
    }
  }

  return true;
};

export const decrementOfficeBookingCount = async (
  config: Config,
  officeId: string,
  date: string,
  includeParking: boolean
) => {
  const attributes = new ExpressionAttributes();
  const updateExpression = new UpdateExpression();
  updateExpression.set(
    'bookingCount',
    new MathematicalExpression(new AttributePath('bookingCount'), '-', 1)
  );
  if (includeParking) {
    updateExpression.set(
      'parkingCount',
      new MathematicalExpression(new AttributePath('parkingCount'), '-', 1)
    );
  }

  const client = new DynamoDB(config.dynamoDB);
  await client
    .updateItem({
      Key: { name: { S: officeId }, date: { S: date } },
      TableName: (config.dynamoDBTablePrefix || '') + 'office-bookings',
      UpdateExpression: updateExpression.serialize(attributes),
      ExpressionAttributeNames: attributes.names,
      ExpressionAttributeValues: attributes.values,
    })
    .promise();
};

export const getOfficeBookings = async (
  config: Config,
  officeId: string,
  dates: string[]
): Promise<OfficeBookingModel[]> => {
  const mapper = buildMapper(config);
  const resultKey = (model: OfficeBookingModel) => model.date;
  const resultsMap = new Map(
    dates.map((date) => {
      const model = Object.assign(new OfficeBookingModel(), { date, name: officeId });
      return [resultKey(model), model];
    })
  );
  const sortedDates = Arrays.sort(dates);
  const condition: ConditionExpression = {
    type: 'And',
    conditions: [
      {
        subject: 'name',
        type: 'Equals',
        object: officeId,
      },
      {
        subject: 'date',
        type: 'Between',
        lowerBound: sortedDates[0],
        upperBound: sortedDates[sortedDates.length - 1],
      },
    ],
  };

  for await (const item of mapper.query(OfficeBookingModel, condition)) {
    const key = resultKey(item);
    if (resultsMap.has(key)) {
      resultsMap.set(key, item);
    }
  }

  for (const [key, value] of Array.from(resultsMap)) {
    if (typeof value.bookingCount !== 'number') {
      value.bookingCount = 0;
      value.parkingCount = 0;
      resultsMap.set(key, value);
    }
  }
  return Array.from(resultsMap.values());
};
