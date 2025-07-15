import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LayerListItemComponent } from './layer-list-item.component';

describe('LayerListItemComponent', () => {
  let component: LayerListItemComponent;
  let fixture: ComponentFixture<LayerListItemComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LayerListItemComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LayerListItemComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
